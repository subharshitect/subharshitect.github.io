"""Record the example inference trace used by /experiments/trace.html.

Runs facebook/opt-125m in fp16 on one GPU: one prefill over a fixed prompt,
then greedy decode steps reusing the KV cache, under torch.profiler. Writes a
Chrome-format trace that tools/trace_extract.py turns into the compact
browser format.

Needs torch + transformers (not needed for the site itself):

    python3 tools/profile_example.py --out scratch/opt125m.trace.json
    python3 tools/trace_extract.py scratch/opt125m.trace.json \
        --context tools/example_context.json --annotations tools/example_annotations.json \
        --out data/traces/opt125m-decode.json
"""

import argparse
import json
import platform

import torch
from torch.profiler import ProfilerActivity, profile, record_function
from transformers import AutoModelForCausalLM, AutoTokenizer


PROMPT = (
    "Memory during inference is mostly the key-value cache. Each new token adds one key and one "
    "value vector per layer, so the cache grows linearly with the sequence. "
) * 3


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="facebook/opt-125m")
    ap.add_argument("--decode-steps", type=int, default=8)
    ap.add_argument("--out", required=True)
    ap.add_argument("--meta-out", help="where to write run metadata (hardware, versions, prompt length)")
    args = ap.parse_args()

    torch.manual_seed(0)
    tok = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForCausalLM.from_pretrained(args.model, torch_dtype=torch.float16).cuda().eval()
    ids = tok(PROMPT, return_tensors="pt").input_ids.cuda()

    def run():
        with torch.no_grad():
            with record_function("prefill"):
                out = model(ids, use_cache=True)
            past = out.past_key_values
            nxt = out.logits[:, -1:].argmax(-1)
            for i in range(args.decode_steps):
                with record_function(f"decode {i + 1}"):
                    out = model(nxt, past_key_values=past, use_cache=True)
                past = out.past_key_values
                nxt = out.logits[:, -1:].argmax(-1)
        torch.cuda.synchronize()

    run()  # warm-up: cuBLAS handles, kernel selection, allocator pools
    with profile(activities=[ProfilerActivity.CPU, ProfilerActivity.CUDA], profile_memory=True) as prof:
        run()
    prof.export_chrome_trace(args.out)

    if args.meta_out:
        import transformers

        meta = {
            "gpu": torch.cuda.get_device_name(0),
            "torch": torch.__version__,
            "cuda": torch.version.cuda,
            "transformers": transformers.__version__,
            "python": platform.python_version(),
            "prompt_tokens": int(ids.shape[1]),
            "decode_steps": args.decode_steps,
            "model": args.model,
        }
        with open(args.meta_out, "w") as f:
            json.dump(meta, f, indent=2)


if __name__ == "__main__":
    main()
