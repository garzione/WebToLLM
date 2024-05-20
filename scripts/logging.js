/**
 * Logging utility for the WebToLLM extension.
 * Provides a Logger class for consistent logging throughout the project.
 */

export class Logger {
  constructor(filename) {
    this.fileName = filename;
  }

  log(message, source) {
    message = `[${new Date().toLocaleString()}] From: ${
      source || this.fileName
    }:\n${message}`;
    console.log(message);
  }

  logWrapper(fn, fnName) {
    return (...args) => {
      this.log(`Calling ${fnName} with arguments: ${JSON.stringify(args)}`);
      const result = fn.apply(this, args);
      if (result instanceof Promise) {
        return result
          .then((res) => {
            this.log(`${fnName} resolved with: ${JSON.stringify(res)}`);
            return res;
          })
          .catch((err) => {
            this.log(`${fnName} rejected with: ${err.message}`);
            throw err;
          });
      } else {
        this.log(`${fnName} returned: ${JSON.stringify(result)}`);
        return result;
      }
    };
  }
}
