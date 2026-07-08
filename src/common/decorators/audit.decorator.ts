// =============================================================================
// Audit Decorators — @AuditTable, @SkipAudit
// =============================================================================
// OK Footwear ERP — Sprint 2
// =============================================================================

export const AUDIT_TABLE_KEY = 'audit:table';
export const SKIP_AUDIT_KEY = 'audit:skip';

/**
 * Mark a controller method for audit logging with the specified table name.
 * @example @AuditTable('sys.users')
 */
export const AuditTable = (tableName: string): MethodDecorator => {
  return (
    target: object,
    _key?: string | symbol,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    descriptor?: any,
  ) => {
    if (descriptor) {
      Reflect.defineMetadata(AUDIT_TABLE_KEY, tableName, descriptor.value);
    } else {
      Reflect.defineMetadata(AUDIT_TABLE_KEY, tableName, target);
    }
  };
};

/**
 * Skip audit logging for this endpoint.
 * @example @SkipAudit()
 */
export const SkipAudit = (): MethodDecorator => {
  return (
    target: object,
    _key?: string | symbol,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    descriptor?: any,
  ) => {
    if (descriptor) {
      Reflect.defineMetadata(SKIP_AUDIT_KEY, true, descriptor.value);
    } else {
      Reflect.defineMetadata(SKIP_AUDIT_KEY, true, target);
    }
  };
};
