// Saved simulation states, kept in this browser's localStorage only.

import { migrateSaved } from "./sim/core.js";

const KEY = "sr.sim-saves.v1";
export const SAVE_LIMIT = 40;

export class SaveStore {
  constructor(registry) {
    this.registry = registry;
    this.available = true;
    this.items = this.read();
  }

  read() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(raw) ? raw.map((s) => migrateSaved(s, this.registry)).filter(Boolean) : [];
    } catch (_e) {
      this.available = false;
      return [];
    }
  }

  write() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.items));
      return true;
    } catch (_e) {
      this.available = false;
      return false;
    }
  }

  add(save) {
    this.items = [save, ...this.items.filter((s) => s.id !== save.id)].slice(0, SAVE_LIMIT);
    return this.write();
  }

  // Imported saves are merged by id; existing entries win so nothing is overwritten.
  merge(saves) {
    const known = new Set(this.items.map((s) => s.id));
    const fresh = saves.filter((s) => !known.has(s.id));
    this.items = [...this.items, ...fresh].slice(0, SAVE_LIMIT);
    this.write();
    return fresh.length;
  }

  rename(id, name) {
    const s = this.items.find((x) => x.id === id);
    if (!s) return;
    s.name = name.trim().slice(0, 80);
    this.write();
  }

  remove(id) {
    this.items = this.items.filter((s) => s.id !== id);
    this.write();
  }
}

export function newSaveId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
