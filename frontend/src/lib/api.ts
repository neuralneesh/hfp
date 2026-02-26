import {
    GraphData,
    SimulationRequest,
    SimulationResponse,
    CompareSimulationRequest,
    CompareSimulationResponse,
} from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export const getGraph = async (): Promise<GraphData> => {
    const response = await fetch(`${API_BASE_URL}/graph`);
    if (!response.ok) throw new Error('Failed to fetch graph');
    return response.json();
};

export const simulate = async (request: SimulationRequest): Promise<SimulationResponse> => {
    const response = await fetch(`${API_BASE_URL}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error('Simulation failed');
    return response.json();
};

export const compareSimulations = async (request: CompareSimulationRequest): Promise<CompareSimulationResponse> => {
    const response = await fetch(`${API_BASE_URL}/simulate/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error('Comparison failed');
    return response.json();
};

export const reloadGraph = async () => {
    const response = await fetch(`${API_BASE_URL}/reload`, {
        method: 'POST',
    });
    if (!response.ok) throw new Error('Reload failed');
    return response.json();
};
