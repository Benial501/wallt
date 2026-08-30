const PDFParser = require('./PDFParser');

module.exports = class PosteParser {
  constructor() {
    this.parser = new PDFParser({ bankId: 'poste' });
  }

  async parse(buffer, opts) {
    return this.parser.parse(buffer, opts);
  }
};

