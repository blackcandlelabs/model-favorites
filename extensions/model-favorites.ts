/**
 * Model favorites for pi.
 *
 * /addfav    add the current model to favorites
 * /subfav    remove the current model from favorites
 * /favorites open a picker showing only favorited models (enter to switch)
 *
 * Favorites persist in ~/.pi/agent/model-favorites.json. The built-in
 * /model picker is left untouched.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";
import { Container, Input, Spacer, Text, fuzzyFilter } from "@earendil-works/pi-tui";

const FAVORITES_FILE = join(homedir(), ".pi", "agent", "model-favorites.json");

type AnyModel = Model<any>;

function loadFavorites(): string[] {
	try {
		const data = JSON.parse(readFileSync(FAVORITES_FILE, "utf8"));
		return Array.isArray(data) ? data.filter((x): x is string => typeof x === "string") : [];
	} catch {
		return [];
	}
}

function saveFavorites(favorites: string[]): void {
	mkdirSync(join(homedir(), ".pi", "agent"), { recursive: true });
	writeFileSync(FAVORITES_FILE, JSON.stringify(favorites, null, "\t"));
}

function keyOf(model: AnyModel): string {
	return `${model.provider}/${model.id}`;
}

type PickerEntry = {
	model: AnyModel;
	current: boolean;
};

class FavoritesOnlyPicker extends Container {
	private tui: { requestRender(): void };
	private theme: { fg(token: string, text: string): string };
	private kb: { matches(data: string, keybinding: string): boolean };
	private done: (model: AnyModel | undefined) => void;
	private currentKey: string | undefined;
	private allFavorites: AnyModel[];
	private searchInput: Input;
	private listContainer = new Container();
	private filtered: PickerEntry[] = [];
	private selectedIndex = 0;

	private _focused = false;
	get focused() {
		return this._focused;
	}
	set focused(value: boolean) {
		this._focused = value;
		this.searchInput.focused = value;
	}

	constructor(
		tui: { requestRender(): void },
		theme: { fg(token: string, text: string): string },
		kb: { matches(data: string, keybinding: string): boolean },
		favoriteModels: AnyModel[],
		currentModel: AnyModel | undefined,
		done: (model: AnyModel | undefined) => void,
	) {
		super();
		this.tui = tui;
		this.theme = theme;
		this.kb = kb;
		this.done = done;
		this.currentKey = currentModel ? keyOf(currentModel) : undefined;
		this.allFavorites = favoriteModels;

		this.addChild(new Text(theme.fg("accent", "★ Favorite models"), 0, 0));
		this.addChild(new Spacer(1));
		this.searchInput = new Input();
		this.searchInput.focused = true;
		this.addChild(this.searchInput);
		this.addChild(new Spacer(1));
		this.addChild(this.listContainer);
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("dim", "  type to search · ↑/↓ navigate · enter select · esc close"), 0, 0));

		this.rebuild("");
	}

	private rebuild(query: string) {
		const searchText = (m: AnyModel) => `${m.provider}/${m.id} ${m.name}`;
		this.filtered = query.trim()
			? fuzzyFilter(this.allFavorites, query, searchText).map((model) => ({
					model,
					current: keyOf(model) === this.currentKey,
				}))
			: this.allFavorites.map((model) => ({ model, current: keyOf(model) === this.currentKey }));
		this.selectedIndex = query.trim() ? 0 : Math.min(this.selectedIndex, Math.max(0, this.filtered.length - 1));
		this.updateList();
	}

	private updateList() {
		this.listContainer.clear();
		const maxVisible = 10;
		const total = this.filtered.length;
		const start = Math.max(0, Math.min(this.selectedIndex - Math.floor(maxVisible / 2), total - maxVisible));
		const end = Math.min(start + maxVisible, total);
		const dim = (s: string) => this.theme.fg("dim", s);

		for (let i = start; i < end; i++) {
			const entry = this.filtered[i];
			const selected = i === this.selectedIndex;
			const cursor = selected ? this.theme.fg("accent", "→ ") : "  ";
			const id = selected ? this.theme.fg("accent", entry.model.id) : entry.model.id;
			const provider = dim(`  [${entry.model.provider}]`);
			const inUse = entry.current ? this.theme.fg("success", "  ✓ in use") : "";
			this.listContainer.addChild(new Text(`${cursor}★ ${id}${provider}${inUse}`, 0, 0));
		}

		if (total === 0) {
			this.listContainer.addChild(new Text(dim("No matching favorites"), 0, 0));
		} else if (start > 0 || end < total) {
			this.listContainer.addChild(new Text(dim(`  (${this.selectedIndex + 1}/${total})`), 0, 0));
		} else {
			const selectedEntry = this.filtered[this.selectedIndex];
			if (selectedEntry) {
				this.listContainer.addChild(new Spacer(1));
				this.listContainer.addChild(new Text(dim(`  Name: ${selectedEntry.model.name}`), 0, 0));
			}
		}
	}

	handleInput(data: string) {
		if (this.kb.matches(data, "tui.select.up")) {
			if (this.filtered.length) {
				this.selectedIndex =
					this.selectedIndex === 0 ? this.filtered.length - 1 : this.selectedIndex - 1;
				this.updateList();
			}
		} else if (this.kb.matches(data, "tui.select.down")) {
			if (this.filtered.length) {
				this.selectedIndex = this.selectedIndex === this.filtered.length - 1 ? 0 : this.selectedIndex + 1;
				this.updateList();
			}
		} else if (this.kb.matches(data, "tui.select.confirm")) {
			const entry = this.filtered[this.selectedIndex];
			if (entry) this.done(entry.model);
		} else if (this.kb.matches(data, "tui.select.cancel")) {
			this.done(undefined);
		} else {
			this.searchInput.handleInput(data);
			this.rebuild(this.searchInput.getValue());
		}
		this.tui.requestRender();
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("addfav", {
		description: "Add the current model to favorites",
		handler: async (_args, ctx) => {
			const model = ctx.model;
			if (!model) {
				ctx.ui.notify("No model selected", "warning");
				return;
			}
			const key = keyOf(model);
			const favorites = loadFavorites();
			if (favorites.includes(key)) {
				ctx.ui.notify(`${key} is already in your favorites`, "warning");
				return;
			}
			favorites.push(key);
			saveFavorites(favorites);
			ctx.ui.notify(`★ Favorited ${key}`, "info");
		},
	});

	pi.registerCommand("subfav", {
		description: "Remove the current model from favorites",
		handler: async (args, ctx) => {
			const key = (args ?? "").trim();
			const favorites = loadFavorites();
			if (key) {
				// /subfav provider/id or model id removes without needing to switch to it
				const target = favorites.find((f) => f === key || f.split("/").at(-1) === key);
				if (!target) {
					ctx.ui.notify(`${key} is not in your favorites`, "warning");
					return;
				}
				saveFavorites(favorites.filter((f) => f !== target));
				ctx.ui.notify(`Removed ${target} from favorites`, "info");
				return;
			}
			const model = ctx.model;
			if (!model) {
				ctx.ui.notify("No model selected", "warning");
				return;
			}
			const currentKey = keyOf(model);
			if (!favorites.includes(currentKey)) {
				ctx.ui.notify(`${currentKey} is not in your favorites`, "warning");
				return;
			}
			saveFavorites(favorites.filter((f) => f !== currentKey));
			ctx.ui.notify(`Removed ${currentKey} from favorites`, "info");
		},
	});

	pi.registerCommand("favorites", {
		description: "Show and switch between your favorite models",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/favorites requires interactive mode", "error");
				return;
			}
			const favorites = loadFavorites();
			const available = new Map([...ctx.modelRegistry.getAvailable()].map((m) => [keyOf(m), m]));
			const favoriteModels: AnyModel[] = [];
			for (const fav of favorites) {
				const model = available.get(fav);
				if (model) favoriteModels.push(model);
				else ctx.ui.notify(`Favorite ${fav} is not currently available`, "warning");
			}
			if (favoriteModels.length === 0) {
				ctx.ui.notify("No favorites yet — switch to a model and run /addfav", "info");
				return;
			}
			const selected = await ctx.ui.custom<AnyModel | undefined>(
				(tui, theme, kb, done) =>
					new FavoritesOnlyPicker(tui, theme, kb, favoriteModels, ctx.model, done),
				{ overlay: true, overlayOptions: { width: "60%", maxHeight: "60%" } },
			);
			if (selected) {
				const ok = await pi.setModel(selected);
				if (!ok) {
					ctx.ui.notify(`No authentication configured for ${keyOf(selected)}`, "error");
				}
			}
		},
	});
}
