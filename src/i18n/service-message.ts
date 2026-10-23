import templates from './service-messages.json';

export type ServiceCode = keyof typeof templates;
export type MessageParams = Record<string, string | number>;
export type ServiceMessage = { message: string; messageCode: ServiceCode; messageParams?: MessageParams };
export function serviceText(code: ServiceCode, params: MessageParams = {}): string {
  return templates[code].replace(/\{(\w+)\}/g, (match, key: string) => String(params[key] ?? match));
}
export function serviceMessage(code: ServiceCode, params?: MessageParams): ServiceMessage {
  return { message: serviceText(code, params), messageCode: code, ...(params ? { messageParams: params } : {}) };
}
export class ServiceError extends Error implements ServiceMessage {
  readonly messageCode: ServiceCode;
  readonly messageParams?: MessageParams;
  constructor(code: ServiceCode, params?: MessageParams) {
    super(serviceText(code, params));
    this.name = 'ServiceError'; this.messageCode = code; this.messageParams = params;
  }
}

// Legacy receipts and string-returning validation APIs retain their original contract.
// Match complete application-owned templates only, never substrings or on-chain bodies.
const patterns = (Object.entries(templates) as [ServiceCode, string][]).filter(([code]) => code !== "related_read_failed").map(([code, template]) => {
  const keys: string[] = [];
  const parts = template.split(/(\{\w+\})/g);
  const source = parts.map(part => /^\{\w+\}$/.test(part)
    ? (keys.push(part.slice(1, -1)), '([\\s\\S]*?)')
    : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
  return { code, keys, regex: new RegExp(`^${source}$`), specificity: template.replace(/\{\w+\}/g, '').length };
}).sort((a, b) => Number(a.keys.length > 0) - Number(b.keys.length > 0) || b.specificity - a.specificity);

export function describeServiceMessage(value: unknown): ServiceMessage | null {
  if (value && typeof value === 'object' && 'messageCode' in value && typeof value.messageCode === 'string' && Object.hasOwn(templates, value.messageCode)) {
    const descriptor = value as ServiceMessage;
    const resolved = serviceMessage(descriptor.messageCode, descriptor.messageParams);
    if (descriptor.message === resolved.message) return resolved;
  }
  const text = typeof value === 'string' ? value : value && typeof value === 'object' && 'message' in value ? String(value.message) : null;
  if (text === null) return null;
  for (const { code, keys, regex } of patterns) {
    const match = regex.exec(text);
    if (match) return serviceMessage(code, Object.fromEntries(keys.map((key, i) => [key, match[i + 1]])));
  }
  return null;
}
