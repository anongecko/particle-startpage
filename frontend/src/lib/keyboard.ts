import { browser } from '$app/environment';
import { throttle } from './utils';

export interface KeyboardShortcutResult {
	preventDefault: boolean;
	handled: boolean;
}

export interface KeyboardContext {
	settings: any;
	onToggleSettings: () => void;
	onFocusSearch: () => void;
	onEscape: () => void;
	onNextWallpaper?: () => void;
	onPreviousWallpaper?: () => void;
	onToggleParticles?: () => void;
}

interface KeyCombination {
	modifiers: Set<string>;
	key: string;
}

interface ShortcutHandler {
	action: string;
	handler: () => void;
	allowInInput: boolean;
	priority: number;
}

const MODIFIER_KEYS = new Set(['ctrl', 'alt', 'shift', 'meta']);
const NAVIGATION_KEYS = new Set([
	'arrowup',
	'arrowdown',
	'arrowleft',
	'arrowright',
	'home',
	'end',
	'pageup',
	'pagedown'
]);
const BROWSER_SHORTCUTS = new Set([
	'ctrl+r',
	'ctrl+shift+r',
	'f5',
	'ctrl+f5',
	'ctrl+t',
	'ctrl+w',
	'ctrl+shift+t',
	'ctrl+n',
	'ctrl+shift+n',
	'ctrl+l',
	'ctrl+d',
	'ctrl+h',
	'ctrl+shift+delete',
	'ctrl+f',
	'ctrl+g',
	'ctrl+shift+g',
	'f3',
	'shift+f3',
	'ctrl+s',
	'ctrl+p',
	'ctrl+shift+p',
	'ctrl+plus',
	'ctrl+minus',
	'ctrl+0',
	'f12',
	'ctrl+shift+i',
	'ctrl+shift+j',
	'ctrl+u',
	'alt+left',
	'alt+right',
	'ctrl+shift+tab',
	'ctrl+tab'
]);

class KeyboardShortcutManager {
	private pressedKeys = new Set<string>();
	private shortcuts = new Map<string, ShortcutHandler>();
	private isEnabled = true;
	private throttledHandlers = new Map<string, () => void>();

	constructor() {
		if (browser) {
			this.bindEvents();
		}
	}

	private bindEvents(): void {
		document.addEventListener('keydown', this.handleKeyDown, { passive: false });
		document.addEventListener('keyup', this.handleKeyUp, { passive: true });
		document.addEventListener('blur', this.clearPressed, { passive: true });
		window.addEventListener('blur', this.clearPressed, { passive: true });
	}

	private handleKeyDown = (event: KeyboardEvent): void => {
		if (!this.isEnabled) return;

		const normalizedKey = this.normalizeKey(event.key);
		this.pressedKeys.add(normalizedKey);

		if (MODIFIER_KEYS.has(normalizedKey)) return;

		const combination = this.getCurrentCombination(normalizedKey);
		const combinationString = this.combinationToString(combination);

		if (this.shouldDeferToBrowser(combinationString)) return;

		if (this.isInInputElement() && !this.isAllowedInInput(combinationString)) return;

		const handler = this.shortcuts.get(combinationString);
		if (handler) {
			event.preventDefault();
			event.stopPropagation();

			const throttledHandler = this.getThrottledHandler(handler.action, handler.handler);
			throttledHandler();
		}
	};

	private handleKeyUp = (event: KeyboardEvent): void => {
		const normalizedKey = this.normalizeKey(event.key);
		this.pressedKeys.delete(normalizedKey);
	};

	private clearPressed = (): void => {
		this.pressedKeys.clear();
	};

	private normalizeKey(key: string): string {
		const keyMap: Record<string, string> = {
			Control: 'ctrl',
			Alt: 'alt',
			Shift: 'shift',
			Meta: 'meta',
			Cmd: 'meta',
			Command: 'meta',
			' ': 'space',
			ArrowUp: 'arrowup',
			ArrowDown: 'arrowdown',
			ArrowLeft: 'arrowleft',
			ArrowRight: 'arrowright',
			Escape: 'escape',
			Enter: 'enter',
			Tab: 'tab',
			Backspace: 'backspace',
			Delete: 'delete'
		};

		return keyMap[key] || key.toLowerCase();
	}

	private getCurrentCombination(mainKey: string): KeyCombination {
		const modifiers = new Set<string>();

		for (const key of this.pressedKeys) {
			if (MODIFIER_KEYS.has(key)) {
				modifiers.add(key);
			}
		}

		return { modifiers, key: mainKey };
	}

	private combinationToString(combination: KeyCombination): string {
		const modifierOrder = ['ctrl', 'alt', 'shift', 'meta'];
		const sortedModifiers = modifierOrder.filter((mod) => combination.modifiers.has(mod));

		if (sortedModifiers.length === 0) {
			return combination.key;
		}

		return `${sortedModifiers.join('+')}+${combination.key}`;
	}

	private shouldDeferToBrowser(combination: string): boolean {
		return BROWSER_SHORTCUTS.has(combination);
	}

	private isInInputElement(): boolean {
		const activeElement = document.activeElement;
		if (!activeElement) return false;

		const inputTypes = ['input', 'textarea', 'select'];
		const isInput = inputTypes.includes(activeElement.tagName.toLowerCase());
		const isContentEditable = (activeElement as HTMLElement).contentEditable === 'true';

		return isInput || isContentEditable;
	}

	private isAllowedInInput(combination: string): boolean {
		const allowedInInput = new Set([
			'escape',
			'tab',
			'enter',
			'ctrl+a',
			'ctrl+c',
			'ctrl+v',
			'ctrl+x',
			'ctrl+z',
			'ctrl+y'
		]);

		return allowedInInput.has(combination);
	}

	private getThrottledHandler(action: string, handler: () => void): () => void {
		if (!this.throttledHandlers.has(action)) {
			const throttleDelay = this.getThrottleDelay(action);
			this.throttledHandlers.set(action, throttle(handler, throttleDelay));
		}
		return this.throttledHandlers.get(action)!;
	}

	private getThrottleDelay(action: string): number {
		const delayMap: Record<string, number> = {
			nextWallpaper: 300,
			previousWallpaper: 300,
			toggleParticles: 100,
			toggleSettings: 100,
			focusSearch: 50,
			escape: 50
		};

		return delayMap[action] || 100;
	}

	registerShortcut(
		combination: string,
		action: string,
		handler: () => void,
		options: { allowInInput?: boolean; priority?: number } = {}
	): void {
		this.shortcuts.set(combination, {
			action,
			handler,
			allowInInput: options.allowInInput || false,
			priority: options.priority || 0
		});
	}

	unregisterShortcut(combination: string): void {
		this.shortcuts.delete(combination);
	}

	setEnabled(enabled: boolean): void {
		this.isEnabled = enabled;
		if (!enabled) {
			this.clearPressed();
		}
	}

	destroy(): void {
		if (browser) {
			document.removeEventListener('keydown', this.handleKeyDown);
			document.removeEventListener('keyup', this.handleKeyUp);
			document.removeEventListener('blur', this.clearPressed);
			window.removeEventListener('blur', this.clearPressed);
		}

		this.shortcuts.clear();
		this.throttledHandlers.clear();
		this.clearPressed();
	}
}

const shortcutManager = new KeyboardShortcutManager();

export function handleKeyboardShortcuts(
	event: KeyboardEvent,
	context: KeyboardContext
): KeyboardShortcutResult {
	if (!context.settings?.keyboard) {
		return { preventDefault: false, handled: false };
	}

	const modifierKey = context.settings.keyboard.modifier?.keys?.[0] || 'ctrl';
	const shortcuts = context.settings.keyboard.shortcuts || {};

	shortcutManager.unregisterShortcut(`${modifierKey}+${shortcuts.toggleSettings}`);
	shortcutManager.unregisterShortcut(`${modifierKey}+${shortcuts.focusSearch}`);
	shortcutManager.unregisterShortcut(`${modifierKey}+${shortcuts.nextWallpaper}`);
	shortcutManager.unregisterShortcut(`${modifierKey}+${shortcuts.prevWallpaper}`);
	shortcutManager.unregisterShortcut(`${modifierKey}+${shortcuts.toggleParticles}`);
	shortcutManager.unregisterShortcut('escape');

	if (shortcuts.toggleSettings) {
		shortcutManager.registerShortcut(
			`${modifierKey}+${shortcuts.toggleSettings}`,
			'toggleSettings',
			context.onToggleSettings
		);
	}

	if (shortcuts.focusSearch) {
		shortcutManager.registerShortcut(
			`${modifierKey}+${shortcuts.focusSearch}`,
			'focusSearch',
			context.onFocusSearch,
			{ allowInInput: true }
		);
	}

	if (shortcuts.nextWallpaper && context.onNextWallpaper) {
		shortcutManager.registerShortcut(
			`${modifierKey}+${shortcuts.nextWallpaper}`,
			'nextWallpaper',
			context.onNextWallpaper
		);
	}

	if (shortcuts.prevWallpaper && context.onPreviousWallpaper) {
		shortcutManager.registerShortcut(
			`${modifierKey}+${shortcuts.prevWallpaper}`,
			'previousWallpaper',
			context.onPreviousWallpaper
		);
	}

	if (shortcuts.toggleParticles && context.onToggleParticles) {
		shortcutManager.registerShortcut(
			`${modifierKey}+${shortcuts.toggleParticles}`,
			'toggleParticles',
			context.onToggleParticles
		);
	}

	shortcutManager.registerShortcut('escape', 'escape', context.onEscape, { allowInInput: true });

	return { preventDefault: false, handled: false };
}

export function registerGlobalShortcut(
	combination: string,
	handler: () => void,
	options?: { allowInInput?: boolean; priority?: number }
): void {
	shortcutManager.registerShortcut(combination, 'global', handler, options);
}

export function unregisterGlobalShortcut(combination: string): void {
	shortcutManager.unregisterShortcut(combination);
}

export function setKeyboardEnabled(enabled: boolean): void {
	shortcutManager.setEnabled(enabled);
}

export function destroyKeyboardManager(): void {
	shortcutManager.destroy();
}
