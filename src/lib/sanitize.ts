/**
 * Sanitizes user input to prevent data corruption and security issues
 */

// List of potentially dangerous characters/strings that could cause issues
const DANGEROUS_PATTERNS = [
  // SQL injection patterns
  /DROP\s+TABLE/i,
  /DELETE\s+FROM/i,
  /INSERT\s+INTO/i,
  /UPDATE\s+SET/i,
  /CREATE\s+TABLE/i,
  /ALTER\s+TABLE/i,
  // Script injection patterns
  /<script/i,
  /javascript:/i,
  /on\w+\s*=/i,
  // HTML tags
  /<[^>]*>/gi,
  // Control characters
  /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,
  // Excessive whitespace that could cause layout issues
  /\s{10,}/g,
];

// Characters allowed in class keys (more restrictive)
const CLASS_KEY_ALLOWED = /^[A-Z0-9_]*$/;

// Characters allowed in labels and taglines (more permissive but still safe)
const LABEL_ALLOWED = /^[^<>\"'&]*$/;

/**
 * Sanitizes text for class keys (used for database keys)
 */
export function sanitizeClassKey(input: string): string {
  if (!input) return '';
  
  return input
    .trim()
    .replace(/[^\w\s]/gi, '') // Remove non-word characters except spaces
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .toUpperCase()
    .slice(0, 50); // Limit length
}

/**
 * Sanitizes text for labels and taglines
 */
export function sanitizeLabel(input: string): string {
  if (!input) return '';
  
  let sanitized = input.trim();
  
  // Remove dangerous patterns
  DANGEROUS_PATTERNS.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '');
  });
  
  // Remove excessive whitespace
  sanitized = sanitized.replace(/\s+/g, ' ');
  
  // Limit length
  return sanitized.slice(0, 100);
}

/**
 * Validates if a class key is safe
 */
export function isValidClassKey(key: string): boolean {
  return CLASS_KEY_ALLOWED.test(key) && key.length <= 50;
}

/**
 * Validates if a label is safe
 */
export function isValidLabel(label: string): boolean {
  return LABEL_ALLOWED.test(label) && label.length > 0 && label.length <= 100;
}

/**
 * Sanitizes and validates a class name, returns sanitized key and label
 * Returns null if invalid
 */
export function sanitizeClassName(input: string): { key: string; label: string } | null {
  const sanitizedLabel = sanitizeLabel(input);
  
  if (!isValidLabel(sanitizedLabel)) {
    return null;
  }
  
  const key = sanitizeClassKey(sanitizedLabel);
  
  if (!isValidClassKey(key)) {
    return null;
  }
  
  return { key, label: sanitizedLabel };
}

/**
 * Sanitizes tagline text
 */
export function sanitizeTagline(input: string): string {
  return sanitizeLabel(input);
}

/**
 * Validates if a tagline is safe
 */
export function isValidTagline(tagline: string): boolean {
  return tagline.length <= 200; // Taglines can be longer
}
