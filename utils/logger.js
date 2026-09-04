/**
 * Structured logger module.
 * Can be disabled in production. Masks sensitive API keys.
 */

const DEBUG_MODE = true;

function maskKey(key) {
  if (!key || typeof key !== 'string') return key;
  if (key.length <= 8) return "***";
  return `${key.slice(0, 4)}***${key.slice(-4)}`;
}

function formatArgs(args) {
  // Regex to match Groq (gsk_), OpenAI/OpenRouter (sk-), Gemini (AIzaSy, AQ.)
  const maskRegex = /(gsk_[a-zA-Z0-9]+|sk-[a-zA-Z0-9\-_]+|AIzaSy[a-zA-Z0-9\-_]+|AQ\.[a-zA-Z0-9\-_]+)/g;

  return args.map(arg => {
    if (typeof arg === 'string') {
      return arg.replace(maskRegex, match => maskKey(match));
    }
    
    if (arg instanceof Error) {
      return `${arg.name}: ${arg.message}\n${arg.stack || ''}`.replace(maskRegex, match => maskKey(match));
    }
    
    if (arg && typeof arg === 'object') {
      try {
        let str = JSON.stringify(arg, Object.getOwnPropertyNames(arg));
        str = str.replace(maskRegex, match => maskKey(match));
        return JSON.parse(str);
      } catch (e) {
        return arg;
      }
    }
    return arg;
  });
}

function log(level, moduleName, ...args) {
  if (!DEBUG_MODE && level === 'DEBUG') return;
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level}] [${moduleName}]`;
  const safeArgs = formatArgs(args);
  
  if (level === 'ERROR') {
    console.error(prefix, ...safeArgs);
  } else if (level === 'WARNING') {
    console.warn(prefix, ...safeArgs);
  } else {
    console.log(prefix, ...safeArgs);
  }
}

export const Logger = {
  info: (moduleName, ...args) => log('INFO', moduleName, ...args),
  debug: (moduleName, ...args) => log('DEBUG', moduleName, ...args),
  warn: (moduleName, ...args) => log('WARNING', moduleName, ...args),
  error: (moduleName, ...args) => log('ERROR', moduleName, ...args)
};
