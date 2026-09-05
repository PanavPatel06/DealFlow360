import { ErrorCode, UserRole } from '@dealflow/contracts';
import { AppError } from '../../shared/app-error';
import type { RequestUser } from '../../shared/current-user.decorator';

/**
 * Server-side scope for the customer role (invariant 7). Every read a customer
 * user makes goes through here, never through a hidden button.
 */
export const isCustomer = (user: RequestUser) => user.role === UserRole.CUSTOMER;

/** Forces the customer's own id into a filter, whatever the query string asked for. */
export const scopedCustomerId = (user: RequestUser, requested?: string) =>
  isCustomer(user) ? user.customerId : requested;

export function assertOwnCustomer(user: RequestUser, customerId: string) {
  if (isCustomer(user) && user.customerId !== customerId) {
    throw new AppError(ErrorCode.PORTAL_SCOPE_VIOLATION, 'That record belongs to another customer.');
  }
}
