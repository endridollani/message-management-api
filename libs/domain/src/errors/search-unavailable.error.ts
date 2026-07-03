export class SearchUnavailableError extends Error {
  constructor(message = 'Search is temporarily unavailable') {
    super(message);
    this.name = 'SearchUnavailableError';
  }
}
