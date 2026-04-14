export class BaseCollector {
  constructor({ sourceUrl }) {
    this.sourceUrl = sourceUrl;
  }

  async collect() {
    throw new Error("collect() must be implemented");
  }
}
