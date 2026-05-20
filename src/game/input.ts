import type { ControlKey, InputState } from './types';

const EMPTY_INPUT: InputState = {
  left: false,
  right: false,
  accelerate: false,
  brake: false,
  nitro: false,
};

const KEY_MAP: Record<string, ControlKey | undefined> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'accelerate',
  KeyW: 'accelerate',
  ArrowDown: 'brake',
  KeyS: 'brake',
  Space: 'nitro',
};

export class InputController {
  private keyboard: InputState = { ...EMPTY_INPUT };
  private virtual: InputState = { ...EMPTY_INPUT };
  private unbinders: Array<() => void> = [];

  bind() {
    const onKeyDown = (event: KeyboardEvent) => {
      const control = KEY_MAP[event.code];
      if (!control) {
        return;
      }

      event.preventDefault();
      this.keyboard[control] = true;
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const control = KEY_MAP[event.code];
      if (!control) {
        return;
      }

      event.preventDefault();
      this.keyboard[control] = false;
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp, { passive: false });

    this.unbinders.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    });
  }

  dispose() {
    for (const unbind of this.unbinders) {
      unbind();
    }

    this.unbinders = [];
  }

  setVirtual(control: ControlKey, pressed: boolean) {
    this.virtual[control] = pressed;
  }

  clearVirtual() {
    this.virtual = { ...EMPTY_INPUT };
  }

  snapshot(): InputState {
    return {
      left: this.keyboard.left || this.virtual.left,
      right: this.keyboard.right || this.virtual.right,
      accelerate: this.keyboard.accelerate || this.virtual.accelerate,
      brake: this.keyboard.brake || this.virtual.brake,
      nitro: this.keyboard.nitro || this.virtual.nitro,
    };
  }
}
