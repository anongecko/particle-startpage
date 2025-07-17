import { browser } from '$app/environment';
import { retry, createErrorHandler } from './utils';

export interface APIConfig {
	baseURL: string;
	timeout: number;
	retries: number;
	retryDelay: number;
	headers: Record<string, string>;
	interceptors: {
		request: RequestInterceptor[];
		response: ResponseInterceptor[];
	};
}

export interface RequestConfig {
	url: string;
	method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
	data?: any;
	params?: Record<string, any>;
	headers?: Record<string, string>;
	timeout?: number;
	retries?: number;
	cache?: boolean;
	validateStatus?: (status: number) => boolean;
}

export interface ResponseData<T = any> {
	data: T;
	status: number;
	statusText: string;
	headers: Record<string, string>;
	config: RequestConfig;
}

export interface APIError {
	message: string;
	status?: number;
	code?: string;
	data?: any;
	config?: RequestConfig;
}

export type RequestInterceptor = (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
export type ResponseInterceptor = (response: ResponseData) => ResponseData | Promise<ResponseData>;

/**
 * Enhanced fetch-based API client with interceptors, caching, and retry logic
 */
export class APIClient {
	private config: APIConfig;
	private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
	private abortControllers = new Map<string, AbortController>();
	private errorHandler = createErrorHandler('APIClient');

	constructor(config: Partial<APIConfig> = {}) {
		this.config = {
			baseURL: '',
			timeout: 10000,
			retries: 3,
			retryDelay: 1000,
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			interceptors: {
				request: [],
				response: []
			},
			...config
		};
	}

	/**
	 * Make HTTP request
	 */
	async request<T = any>(config: RequestConfig): Promise<ResponseData<T>> {
		const requestConfig = await this.processRequestInterceptors(config);
		const cacheKey = this.generateCacheKey(requestConfig);

		// Check cache for GET requests
		if (requestConfig.method === 'GET' && requestConfig.cache !== false) {
			const cachedResponse = this.getCachedResponse<T>(cacheKey);
			if (cachedResponse) {
				return cachedResponse;
			}
		}

		// Cancel previous request with same key if exists
		this.cancelRequest(cacheKey);

		try {
			const response = await this.executeRequest<T>(requestConfig, cacheKey);
			const processedResponse = await this.processResponseInterceptors(response);

			// Cache successful GET responses
			if (requestConfig.method === 'GET' && requestConfig.cache !== false) {
				this.setCachedResponse(cacheKey, processedResponse);
			}

			return processedResponse;
		} catch (error) {
			this.handleRequestError(error, requestConfig);
			throw error;
		}
	}

	/**
	 * Execute HTTP request with retry logic
	 */
	private async executeRequest<T>(
		config: RequestConfig,
		cacheKey: string
	): Promise<ResponseData<T>> {
		const url = this.buildURL(config.url, config.params);
		const abortController = new AbortController();
		this.abortControllers.set(cacheKey, abortController);

		const requestOptions: RequestInit = {
			method: config.method,
			headers: this.buildHeaders(config.headers),
			signal: abortController.signal
		};

		// Add body for non-GET requests
		if (config.data && config.method !== 'GET') {
			requestOptions.body = this.serializeData(config.data);
		}

		// Setup timeout
		const timeoutId = setTimeout(() => {
			abortController.abort();
		}, config.timeout || this.config.timeout);

		try {
			const response = await retry(
				async () => {
					const fetchResponse = await fetch(url, requestOptions);

					// Validate status
					const isValid = config.validateStatus
						? config.validateStatus(fetchResponse.status)
						: fetchResponse.status >= 200 && fetchResponse.status < 300;

					if (!isValid) {
						throw new APIError({
							message: `Request failed with status ${fetchResponse.status}`,
							status: fetchResponse.status,
							config
						});
					}

					return fetchResponse;
				},
				{
					maxAttempts: config.retries || this.config.retries,
					delay: this.config.retryDelay,
					onRetry: (attempt, error) => {
						console.warn(`API request retry ${attempt}:`, error.message);
					}
				}
			);

			clearTimeout(timeoutId);
			this.abortControllers.delete(cacheKey);

			const data = await this.parseResponse<T>(response);

			return {
				data,
				status: response.status,
				statusText: response.statusText,
				headers: this.parseHeaders(response.headers),
				config
			};
		} catch (error) {
			clearTimeout(timeoutId);
			this.abortControllers.delete(cacheKey);

			if (error.name === 'AbortError') {
				throw new APIError({
					message: 'Request was cancelled',
					code: 'CANCELLED',
					config
				});
			}

			throw error;
		}
	}

	/**
	 * Process request interceptors
	 */
	private async processRequestInterceptors(config: RequestConfig): Promise<RequestConfig> {
		let processedConfig = { ...config };

		for (const interceptor of this.config.interceptors.request) {
			try {
				processedConfig = await interceptor(processedConfig);
			} catch (error) {
				this.errorHandler(error, { context: 'request interceptor' });
				throw error;
			}
		}

		return processedConfig;
	}

	/**
	 * Process response interceptors
	 */
	private async processResponseInterceptors<T>(
		response: ResponseData<T>
	): Promise<ResponseData<T>> {
		let processedResponse = { ...response };

		for (const interceptor of this.config.interceptors.response) {
			try {
				processedResponse = await interceptor(processedResponse);
			} catch (error) {
				this.errorHandler(error, { context: 'response interceptor' });
				throw error;
			}
		}

		return processedResponse;
	}

	/**
	 * Build complete URL with parameters
	 */
	private buildURL(url: string, params?: Record<string, any>): string {
		const baseURL = this.config.baseURL.replace(/\/+$/, '');
		const cleanURL = url.replace(/^\/+/, '');
		let fullURL = baseURL ? `${baseURL}/${cleanURL}` : cleanURL;

		if (params) {
			const searchParams = new URLSearchParams();
			Object.entries(params).forEach(([key, value]) => {
				if (value !== undefined && value !== null) {
					searchParams.append(key, String(value));
				}
			});

			const queryString = searchParams.toString();
			if (queryString) {
				fullURL += `?${queryString}`;
			}
		}

		return fullURL;
	}

	/**
	 * Build request headers
	 */
	private buildHeaders(requestHeaders?: Record<string, string>): Record<string, string> {
		return {
			...this.config.headers,
			...requestHeaders
		};
	}

	/**
	 * Serialize request data
	 */
	private serializeData(data: any): string {
		if (typeof data === 'string') {
			return data;
		}

		if (data instanceof FormData) {
			return data as any;
		}

		return JSON.stringify(data);
	}

	/**
	 * Parse response data
	 */
	private async parseResponse<T>(response: Response): Promise<T> {
		const contentType = response.headers.get('content-type');

		if (contentType?.includes('application/json')) {
			return response.json();
		}

		if (contentType?.includes('text/')) {
			return response.text() as any;
		}

		return response.blob() as any;
	}

	/**
	 * Parse response headers
	 */
	private parseHeaders(headers: Headers): Record<string, string> {
		const result: Record<string, string> = {};
		headers.forEach((value, key) => {
			result[key] = value;
		});
		return result;
	}

	/**
	 * Generate cache key
	 */
	private generateCacheKey(config: RequestConfig): string {
		const { url, method, params, data } = config;
		return `${method}:${url}:${JSON.stringify(params)}:${JSON.stringify(data)}`;
	}

	/**
	 * Get cached response
	 */
	private getCachedResponse<T>(cacheKey: string): ResponseData<T> | null {
		const cached = this.cache.get(cacheKey);
		if (!cached) return null;

		const now = Date.now();
		if (now - cached.timestamp > cached.ttl) {
			this.cache.delete(cacheKey);
			return null;
		}

		return cached.data;
	}

	/**
	 * Set cached response
	 */
	private setCachedResponse<T>(
		cacheKey: string,
		response: ResponseData<T>,
		ttl: number = 300000
	): void {
		// Default TTL: 5 minutes
		this.cache.set(cacheKey, {
			data: response,
			timestamp: Date.now(),
			ttl
		});

		// Cleanup old cache entries
		this.cleanupCache();
	}

	/**
	 * Cleanup expired cache entries
	 */
	private cleanupCache(): void {
		const now = Date.now();
		for (const [key, value] of this.cache.entries()) {
			if (now - value.timestamp > value.ttl) {
				this.cache.delete(key);
			}
		}
	}

	/**
	 * Cancel request
	 */
	private cancelRequest(cacheKey: string): void {
		const controller = this.abortControllers.get(cacheKey);
		if (controller) {
			controller.abort();
			this.abortControllers.delete(cacheKey);
		}
	}

	/**
	 * Handle request errors
	 */
	private handleRequestError(error: any, config: RequestConfig): void {
		this.errorHandler(error, { config });
	}

	/**
	 * HTTP method helpers
	 */
	async get<T = any>(url: string, config?: Partial<RequestConfig>): Promise<ResponseData<T>> {
		return this.request<T>({ method: 'GET', url, ...config });
	}

	async post<T = any>(
		url: string,
		data?: any,
		config?: Partial<RequestConfig>
	): Promise<ResponseData<T>> {
		return this.request<T>({ method: 'POST', url, data, ...config });
	}

	async put<T = any>(
		url: string,
		data?: any,
		config?: Partial<RequestConfig>
	): Promise<ResponseData<T>> {
		return this.request<T>({ method: 'PUT', url, data, ...config });
	}

	async delete<T = any>(url: string, config?: Partial<RequestConfig>): Promise<ResponseData<T>> {
		return this.request<T>({ method: 'DELETE', url, ...config });
	}

	async patch<T = any>(
		url: string,
		data?: any,
		config?: Partial<RequestConfig>
	): Promise<ResponseData<T>> {
		return this.request<T>({ method: 'PATCH', url, data, ...config });
	}

	/**
	 * Add request interceptor
	 */
	addRequestInterceptor(interceptor: RequestInterceptor): void {
		this.config.interceptors.request.push(interceptor);
	}

	/**
	 * Add response interceptor
	 */
	addResponseInterceptor(interceptor: ResponseInterceptor): void {
		this.config.interceptors.response.push(interceptor);
	}

	/**
	 * Clear cache
	 */
	clearCache(): void {
		this.cache.clear();
	}

	/**
	 * Cancel all pending requests
	 */
	cancelAllRequests(): void {
		this.abortControllers.forEach((controller) => controller.abort());
		this.abortControllers.clear();
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats(): { size: number; entries: string[] } {
		return {
			size: this.cache.size,
			entries: Array.from(this.cache.keys())
		};
	}
}

/**
 * Create API error
 */
function APIError(options: {
	message: string;
	status?: number;
	code?: string;
	data?: any;
	config?: RequestConfig;
}): APIError {
	const error = new Error(options.message) as APIError;
	error.name = 'APIError';
	error.status = options.status;
	error.code = options.code;
	error.data = options.data;
	error.config = options.config;
	return error;
}

/**
 * Default API client instance
 */
export const apiClient = new APIClient({
	baseURL: '/api',
	timeout: 10000,
	retries: 3
});

/**
 * Authentication interceptor
 */
export function createAuthInterceptor(getToken: () => string | null): RequestInterceptor {
	return (config: RequestConfig) => {
		const token = getToken();
		if (token) {
			config.headers = {
				...config.headers,
				Authorization: `Bearer ${token}`
			};
		}
		return config;
	};
}

/**
 * Error handling interceptor
 */
export function createErrorInterceptor(onError: (error: APIError) => void): ResponseInterceptor {
	return (response: ResponseData) => {
		if (response.status >= 400) {
			const error = APIError({
				message: `HTTP ${response.status}: ${response.statusText}`,
				status: response.status,
				data: response.data,
				config: response.config
			});
			onError(error);
		}
		return response;
	};
}

/**
 * Loading state interceptor
 */
export function createLoadingInterceptor(onLoadingChange: (isLoading: boolean) => void): {
	request: RequestInterceptor;
	response: ResponseInterceptor;
} {
	let activeRequests = 0;

	return {
		request: (config: RequestConfig) => {
			activeRequests++;
			onLoadingChange(true);
			return config;
		},
		response: (response: ResponseData) => {
			activeRequests--;
			if (activeRequests === 0) {
				onLoadingChange(false);
			}
			return response;
		}
	};
}

/**
 * Request transformation utilities
 */
export const RequestTransformers = {
	/**
	 * Transform camelCase to snake_case
	 */
	camelToSnake: (config: RequestConfig): RequestConfig => {
		if (config.data && typeof config.data === 'object') {
			config.data = transformKeys(config.data, camelToSnake);
		}
		return config;
	},

	/**
	 * Add timestamp to prevent caching
	 */
	addTimestamp: (config: RequestConfig): RequestConfig => {
		if (config.method === 'GET') {
			config.params = {
				...config.params,
				_t: Date.now()
			};
		}
		return config;
	},

	/**
	 * Add request ID for tracking
	 */
	addRequestId: (config: RequestConfig): RequestConfig => {
		config.headers = {
			...config.headers,
			'X-Request-ID': generateRequestId()
		};
		return config;
	}
};

/**
 * Response transformation utilities
 */
export const ResponseTransformers = {
	/**
	 * Transform snake_case to camelCase
	 */
	snakeToCamel: (response: ResponseData): ResponseData => {
		if (response.data && typeof response.data === 'object') {
			response.data = transformKeys(response.data, snakeToCamel);
		}
		return response;
	},

	/**
	 * Extract data from envelope
	 */
	extractData:
		(dataKey: string = 'data') =>
		(response: ResponseData): ResponseData => {
			if (response.data && typeof response.data === 'object' && dataKey in response.data) {
				response.data = response.data[dataKey];
			}
			return response;
		},

	/**
	 * Add response timing
	 */
	addTiming: (response: ResponseData): ResponseData => {
		const timing = performance.getEntriesByName(response.config.url)[0];
		if (timing) {
			(response as any).timing = {
				duration: timing.duration,
				startTime: timing.startTime
			};
		}
		return response;
	}
};

/**
 * Utility functions
 */
function camelToSnake(str: string): string {
	return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function snakeToCamel(str: string): string {
	return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function transformKeys(obj: any, transformer: (key: string) => string): any {
	if (Array.isArray(obj)) {
		return obj.map((item) => transformKeys(item, transformer));
	}

	if (obj && typeof obj === 'object') {
		const result: any = {};
		for (const [key, value] of Object.entries(obj)) {
			result[transformer(key)] = transformKeys(value, transformer);
		}
		return result;
	}

	return obj;
}

function generateRequestId(): string {
	return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Specialized API clients
 */
export const wallpaperAPI = {
	async getThemes(): Promise<ResponseData<any[]>> {
		return apiClient.get('/wallpapers/themes');
	},

	async getTheme(id: string): Promise<ResponseData<any>> {
		return apiClient.get(`/wallpapers/themes/${id}`);
	},

	async uploadImages(files: FormData): Promise<ResponseData<any>> {
		return apiClient.post('/wallpapers/upload', files, {
			headers: {
				'Content-Type': 'multipart/form-data'
			}
		});
	},

	async deleteTheme(id: string): Promise<ResponseData<any>> {
		return apiClient.delete(`/wallpapers/themes/${id}`);
	}
};

export const bookmarkAPI = {
	async getBookmarks(): Promise<ResponseData<any[]>> {
		return apiClient.get('/bookmarks');
	},

	async createBookmark(data: any): Promise<ResponseData<any>> {
		return apiClient.post('/bookmarks', data);
	},

	async updateBookmark(id: string, data: any): Promise<ResponseData<any>> {
		return apiClient.put(`/bookmarks/${id}`, data);
	},

	async deleteBookmark(id: string): Promise<ResponseData<any>> {
		return apiClient.delete(`/bookmarks/${id}`);
	},

	async sync(data: any): Promise<ResponseData<any>> {
		return apiClient.post('/bookmarks/sync', data);
	}
};

export const settingsAPI = {
	async getSettings(): Promise<ResponseData<any>> {
		return apiClient.get('/settings');
	},

	async updateSettings(data: any): Promise<ResponseData<any>> {
		return apiClient.put('/settings', data);
	},

	async exportSettings(): Promise<ResponseData<any>> {
		return apiClient.get('/settings/export');
	},

	async importSettings(data: any): Promise<ResponseData<any>> {
		return apiClient.post('/settings/import', data);
	}
};
