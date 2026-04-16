import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output, stderr } from "node:process";

export interface Terminal {
  error(message: string): void;
  info(message: string): void;
  prompt(message: string): Promise<string>;
}

export class ConsoleTerminal implements Terminal {
  info(message: string): void {
    output.write(`${message}\n`);
  }

  error(message: string): void {
    stderr.write(`${message}\n`);
  }

  async prompt(message: string): Promise<string> {
    const readline = createInterface({ input, output });

    try {
      return await readline.question(message);
    } finally {
      readline.close();
    }
  }
}
