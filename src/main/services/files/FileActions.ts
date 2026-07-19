import { shell } from 'electron';

/** Thin wrapper over Electron shell so file actions are mockable and in one place. */
export class FileActions {
  async open(filePath: string): Promise<void> {
    const error = await shell.openPath(filePath);
    if (error) throw new Error(error);
  }

  reveal(filePath: string): void {
    shell.showItemInFolder(filePath);
  }
}
