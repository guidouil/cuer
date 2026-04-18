import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { SecretPayload, SecretStore } from "../core/accounts/secretStore.js";

interface StoredSecretDocument {
  schemaVersion: 1;
  payload: SecretPayload;
}

export class FilesystemSecretStore implements SecretStore {
  constructor(private readonly secretsDir: string) {}

  put(secretRef: string, payload: SecretPayload): void {
    mkdirSync(this.secretsDir, { recursive: true });

    const filePath = this.resolvePath(secretRef);
    const document: StoredSecretDocument = {
      schemaVersion: 1,
      payload,
    };

    writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });

    chmodSync(filePath, 0o600);
  }

  get(secretRef: string): SecretPayload | null {
    const filePath = this.resolvePath(secretRef);
    if (!existsSync(filePath)) {
      return null;
    }

    const raw = readFileSync(filePath, "utf8");
    const value = JSON.parse(raw) as StoredSecretDocument;
    return value.payload;
  }

  delete(secretRef: string): void {
    const filePath = this.resolvePath(secretRef);
    if (!existsSync(filePath)) {
      return;
    }

    rmSync(filePath);
  }

  private resolvePath(secretRef: string): string {
    return join(this.secretsDir, `${secretRef}.json`);
  }
}
