/**
 * Contract error handling utilities
 * Centralized error message resolution with i18n support
 */

import * as m from '$lib/paraglide/messages';
import { ContractError } from '$lib/contracts';

/**
 * Get localized error message from ContractError or generic error
 * @param error - Error object (ContractError or generic Error)
 * @returns Localized error message string
 */
export function getContractErrorMessage(error: unknown): string {
    if (error instanceof ContractError) {
        const errorMessages: Record<string, string> = {
            user_rejected: m.user_rejected(),
            insufficient_funds: m.insufficient_funds(),
            network_error: m.network_error(),
            contract_reverted: m.contract_reverted(),
            gas_estimation_failed: m.gas_estimation_failed(),
            nonce_too_low: m.nonce_too_low(),
            replacement_underpriced: m.replacement_underpriced(),
            wallet_not_connected: m.wallet_not_connected(),
            wrong_network: m.wrong_network(),
            timeout: m.timeout(),
            unknown_error: m.unknown_error()
        };
        return errorMessages[error.code] || error.message;
    }
    return error instanceof Error ? error.message : String(error);
}
