export class CuerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CuerError";
  }
}
