import {
    GraphData,
    SimulationRequest,
    SimulationResponse,
    CompareSimulationRequest,
    CompareSimulationResponse,
} from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/**
 * Thrown by all API functions when the server returns a non-2xx status.
 * Callers can inspect `status` to handle specific error codes:
 *
 *   catch (e) {
 *     if (e instanceof ApiError && e.status === 422) { ... }
 *   }
 */
export class ApiError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
        this.name = 'ApiError';
    }
}

/** Reads the response body for a `detail` or `message` field, then throws. */
const throwApiError = async (response: Response, fallback: string): Promise<never> => {
    let message = fallback;
    try {
        const body = await response.json();
        message = body.detail || body.message || fallback;
    } catch {
        // Body was not JSON — use the fallback message
    }
    throw new ApiError(response.status, message);
};

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const getGraph = async (): Promise<GraphData> => {
    const response = await fetch(`${API_BASE_URL}/graph`);
    if (!response.ok) await throwApiError(response, 'Failed to fetch graph');
    return response.json();
};

export const simulate = async (request: SimulationRequest): Promise<SimulationResponse> => {
    const response = await fetch(`${API_BASE_URL}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });
    if (!response.ok) await throwApiError(response, 'Simulation failed');
    return response.json();
};

export const compareSimulations = async (request: CompareSimulationRequest): Promise<CompareSimulationResponse> => {
    const response = await fetch(`${API_BASE_URL}/simulate/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });
    if (!response.ok) await throwApiError(response, 'Comparison failed');
    return response.json();
};

export const reloadGraph = async () => {
    const response = await fetch(`${API_BASE_URL}/reload`, {
        method: 'POST',
    });
    if (!response.ok) await throwApiError(response, 'Reload failed');
    return response.json();
};
