import { addLogEntry } from './aiLogService';
import { getAvailableServersForUser } from './userService';
import { type User } from '../types';
import { supabase } from './supabaseClient';

export const getVeoProxyUrl = (): string => {
  if (window.location.hostname === 'localhost') {
    // console.log('[API Client] Using local VEO proxy: http://localhost:3001');
    return 'http://localhost:3001';
  }
  const userSelectedProxy = sessionStorage.getItem('selectedProxyServer');
  if (userSelectedProxy) {
      // console.log('[API Client] Using user-selected VEO proxy:', userSelectedProxy);
      return userSelectedProxy;
  }
  const fallbackUrl = 'https://veox.monoklix.com';
  console.warn('[API Client] No user-selected VEO proxy found, using fallback:', fallbackUrl);
  return fallbackUrl;
};

export const getImagenProxyUrl = (): string => {
  if (window.location.hostname === 'localhost') {
    // console.log('[API Client] Using local Imagen proxy: http://localhost:3001');
    return 'http://localhost:3001';
  }
  const userSelectedProxy = sessionStorage.getItem('selectedProxyServer');
  if (userSelectedProxy) {
      // console.log('[API Client] Using user-selected Imagen proxy:', userSelectedProxy);
      return userSelectedProxy;
  }
  const fallbackUrl = 'https://gemx.monoklix.com';
  console.warn('[API Client] No user-selected Imagen proxy found, using fallback:', fallbackUrl);
  return fallbackUrl;
};

const getPersonalToken = (): { token: string; createdAt: string; } | null => {
    try {
        const userJson = localStorage.getItem('currentUser');
        if (userJson) {
            const user = JSON.parse(userJson);
            if (user && user.personalAuthToken) {
                return { token: user.personalAuthToken, createdAt: 'personal' };
            }
        }
    } catch (e) {
        console.error("Could not parse user from localStorage to get personal token", e);
    }
    return null;
};

const getCurrentUserInternal = (): User | null => {
    try {
        const savedUserJson = localStorage.getItem('currentUser');
        if (savedUserJson) {
            const user = JSON.parse(savedUserJson) as User;
            if (user && user.id) {
                return user;
            }
        }
    } catch (error) {
        console.error("Failed to parse user from localStorage for activity log.", error);
    }
    return null;
};

export const executeProxiedRequest = async (
  relativePath: string,
  serviceType: 'veo' | 'imagen',
  requestBody: any,
  logContext: string,
  specificToken?: string,
  onStatusUpdate?: (status: string) => void
): Promise<{ data: any; successfulToken: string }> => {
  console.log(`[API Client] Starting process for: ${logContext}`);
  
  const isGenerationRequest = logContext.includes('GENERATE') || logContext.includes('RECIPE');
  if (isGenerationRequest) {
    if (onStatusUpdate) onStatusUpdate('All slots are in use. You are in the queue...');
    
    const serverUrl = serviceType === 'veo' ? getVeoProxyUrl() : getImagenProxyUrl();

    let slotAcquired = false;
    while (!slotAcquired) {
        const { data: acquired, error } = await supabase.rpc('request_generation_slot', { 
            cooldown_seconds: 10,
            server_url: serverUrl
        });

        if (error) {
            console.error('Error requesting generation slot:', error);
            if (onStatusUpdate) onStatusUpdate('');
            throw new Error(`Database error while requesting a generation slot: ${error.message}`);
        }
        if (acquired) {
            slotAcquired = true;
        } else {
            if (onStatusUpdate) onStatusUpdate('Retrying to get a slot in 2 seconds...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    if (onStatusUpdate) onStatusUpdate('Slot acquired successfully. Starting generation...');
  }
  
  const originalServer = sessionStorage.getItem('selectedProxyServer');

  const attemptFetch = async (attempt = 1): Promise<{ data: any; successfulToken: string }> => {
    try {
        const baseUrl = serviceType === 'veo' ? getVeoProxyUrl() : getImagenProxyUrl();
        const endpoint = `${baseUrl}/api/${serviceType}${relativePath}`;

        let tokenToUse: { token: string; createdAt: string; } | null = null;
        let tokenIdentifier: string;

        if (specificToken) {
            tokenToUse = { token: specificToken, createdAt: 'specific' };
            tokenIdentifier = 'Provided Token';
        } else {
            tokenToUse = getPersonalToken();
            if (!tokenToUse) {
                throw new Error(`Personal Auth Token is required for ${logContext}, but none was found.`);
            }
            tokenIdentifier = 'Personal Token';
        }
        
        const currentUser = getCurrentUserInternal();
        if (onStatusUpdate) onStatusUpdate(`Attempting generation with ${tokenIdentifier}...`);
        console.log(`[API Client] Attempting ${logContext} on ${baseUrl} with ${tokenIdentifier} (...${tokenToUse.token.slice(-6)})`);
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokenToUse.token}`,
                'x-user-username': currentUser?.username || 'unknown',
            },
            body: JSON.stringify(requestBody),
        });

        const data = await response.json().catch(async () => {
             const textResponse = await response.text();
             return { error: { message: `Proxy returned non-JSON response (${response.status}): ${textResponse}` } };
        });

        console.log(`[API Client] Response for ${logContext} with ${tokenIdentifier}. Status: ${response.status}`);

        if (!response.ok) {
            const errorMessage = data.error?.message || data.message || `API call failed (${response.status})`;
            throw new Error(errorMessage);
        }
        
        console.log(`✅ [API Client] Success for ${logContext}`);
        return { data, successfulToken: tokenToUse.token };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isNetworkError = errorMessage.toLowerCase().includes('failed to fetch') || errorMessage.toLowerCase().includes('load failed');

        if (isNetworkError && attempt < 2) {
            console.warn(`[API Fallback] Network error for ${logContext}. Attempting fallback.`);
            addLogEntry({ model: logContext, prompt: `Network Error - Retrying`, output: `Attempting fallback to another server...`, tokenCount: 0, status: 'Error', error: errorMessage });
            if (onStatusUpdate) onStatusUpdate('Network error, trying a backup server...');

            const currentUser = getCurrentUserInternal();
            if (!currentUser) throw error;

            const availableServers = await getAvailableServersForUser(currentUser);
            const currentServer = sessionStorage.getItem('selectedProxyServer');
            const otherServers = availableServers.filter(s => s !== currentServer);

            if (otherServers.length > 0) {
                const fallbackServer = otherServers[Math.floor(Math.random() * otherServers.length)];
                console.log(`[API Fallback] Switching from ${currentServer} to fallback server: ${fallbackServer}`);
                sessionStorage.setItem('selectedProxyServer', fallbackServer);
                return attemptFetch(attempt + 1);
            }
        }
        
        // If it's not a network error, or it's a retry that failed, or no fallbacks exist, restore original server and throw.
        if (originalServer) {
            sessionStorage.setItem('selectedProxyServer', originalServer);
        } else {
            sessionStorage.removeItem('selectedProxyServer');
        }
        throw error;
    }
  };

  try {
    return await attemptFetch();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ [API Client] Request failed permanently for ${logContext}:`, errorMessage);
    addLogEntry({ model: logContext, prompt: `Request failed`, output: errorMessage, tokenCount: 0, status: 'Error', error: errorMessage });
    throw error;
  }
};
