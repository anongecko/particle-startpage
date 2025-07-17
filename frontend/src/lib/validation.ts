import { isValidUrl, isString, isNumber, isArray, isObject } from './utils';

export interface ValidationRule {
	name: string;
	validate: (value: any, context?: any) => boolean | Promise<boolean>;
	message: string | ((value: any, context?: any) => string);
}

export interface ValidationResult {
	isValid: boolean;
	errors: ValidationError[];
	warnings: ValidationError[];
}

export interface ValidationError {
	field: string;
	rule: string;
	message: string;
	value: any;
}

export interface ValidationSchema {
	[field: string]: ValidationRule[] | ValidationSchema;
}

export interface ValidatorConfig {
	stopOnFirstError: boolean;
	allowUnknownFields: boolean;
	strict: boolean;
}

/**
 * Built-in validation rules
 */
export const ValidationRules = {
	/**
	 * Required field validation
	 */
	required: (message: string = 'This field is required'): ValidationRule => ({
		name: 'required',
		validate: (value: any) => {
			if (value === null || value === undefined) return false;
			if (isString(value)) return value.trim().length > 0;
			if (isArray(value)) return value.length > 0;
			if (isObject(value)) return Object.keys(value).length > 0;
			return true;
		},
		message
	}),

	/**
	 * String length validation
	 */
	minLength: (min: number, message?: string): ValidationRule => ({
		name: 'minLength',
		validate: (value: string) => {
			if (!isString(value)) return false;
			return value.length >= min;
		},
		message: message || `Must be at least ${min} characters long`
	}),

	maxLength: (max: number, message?: string): ValidationRule => ({
		name: 'maxLength',
		validate: (value: string) => {
			if (!isString(value)) return false;
			return value.length <= max;
		},
		message: message || `Must be no more than ${max} characters long`
	}),

	/**
	 * Number range validation
	 */
	min: (min: number, message?: string): ValidationRule => ({
		name: 'min',
		validate: (value: number) => {
			if (!isNumber(value)) return false;
			return value >= min;
		},
		message: message || `Must be at least ${min}`
	}),

	max: (max: number, message?: string): ValidationRule => ({
		name: 'max',
		validate: (value: number) => {
			if (!isNumber(value)) return false;
			return value <= max;
		},
		message: message || `Must be no more than ${max}`
	}),

	/**
	 * Pattern validation
	 */
	pattern: (regex: RegExp, message?: string): ValidationRule => ({
		name: 'pattern',
		validate: (value: string) => {
			if (!isString(value)) return false;
			return regex.test(value);
		},
		message: message || 'Invalid format'
	}),

	/**
	 * Email validation
	 */
	email: (message: string = 'Invalid email address'): ValidationRule => ({
		name: 'email',
		validate: (value: string) => {
			if (!isString(value)) return false;
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
			return emailRegex.test(value);
		},
		message
	}),

	/**
	 * URL validation
	 */
	url: (message: string = 'Invalid URL'): ValidationRule => ({
		name: 'url',
		validate: (value: string) => {
			if (!isString(value)) return false;
			return isValidUrl(value);
		},
		message
	}),

	/**
	 * Type validation
	 */
	string: (message: string = 'Must be a string'): ValidationRule => ({
		name: 'string',
		validate: (value: any) => isString(value),
		message
	}),

	number: (message: string = 'Must be a number'): ValidationRule => ({
		name: 'number',
		validate: (value: any) => isNumber(value),
		message
	}),

	boolean: (message: string = 'Must be a boolean'): ValidationRule => ({
		name: 'boolean',
		validate: (value: any) => typeof value === 'boolean',
		message
	}),

	array: (message: string = 'Must be an array'): ValidationRule => ({
		name: 'array',
		validate: (value: any) => isArray(value),
		message
	}),

	object: (message: string = 'Must be an object'): ValidationRule => ({
		name: 'object',
		validate: (value: any) => isObject(value),
		message
	}),

	/**
	 * Enum validation
	 */
	oneOf: (values: any[], message?: string): ValidationRule => ({
		name: 'oneOf',
		validate: (value: any) => values.includes(value),
		message: message || `Must be one of: ${values.join(', ')}`
	}),

	/**
	 * Array validation
	 */
	arrayOf: (itemRules: ValidationRule[], message?: string): ValidationRule => ({
		name: 'arrayOf',
		validate: async (value: any[]) => {
			if (!isArray(value)) return false;

			for (const item of value) {
				for (const rule of itemRules) {
					const isValid = await rule.validate(item);
					if (!isValid) return false;
				}
			}
			return true;
		},
		message: message || 'Array contains invalid items'
	}),

	/**
	 * Object shape validation
	 */
	shape: (schema: ValidationSchema, message?: string): ValidationRule => ({
		name: 'shape',
		validate: async (value: any) => {
			if (!isObject(value)) return false;

			const validator = new Validator(schema);
			const result = await validator.validate(value);
			return result.isValid;
		},
		message: message || 'Object has invalid shape'
	}),

	/**
	 * Custom validation
	 */
	custom: (
		validator: (value: any, context?: any) => boolean | Promise<boolean>,
		message: string | ((value: any, context?: any) => string)
	): ValidationRule => ({
		name: 'custom',
		validate: validator,
		message
	}),

	/**
	 * File validation
	 */
	fileSize: (maxSize: number, message?: string): ValidationRule => ({
		name: 'fileSize',
		validate: (value: File) => {
			if (!(value instanceof File)) return false;
			return value.size <= maxSize;
		},
		message: message || `File size must be less than ${formatFileSize(maxSize)}`
	}),

	fileType: (allowedTypes: string[], message?: string): ValidationRule => ({
		name: 'fileType',
		validate: (value: File) => {
			if (!(value instanceof File)) return false;
			return allowedTypes.includes(value.type);
		},
		message: message || `File type must be one of: ${allowedTypes.join(', ')}`
	}),

	/**
	 * Date validation
	 */
	dateAfter: (date: Date, message?: string): ValidationRule => ({
		name: 'dateAfter',
		validate: (value: Date) => {
			if (!(value instanceof Date)) return false;
			return value.getTime() > date.getTime();
		},
		message: message || `Date must be after ${date.toLocaleDateString()}`
	}),

	dateBefore: (date: Date, message?: string): ValidationRule => ({
		name: 'dateBefore',
		validate: (value: Date) => {
			if (!(value instanceof Date)) return false;
			return value.getTime() < date.getTime();
		},
		message: message || `Date must be before ${date.toLocaleDateString()}`
	}),

	/**
	 * Async validation
	 */
	async: (
		validator: (value: any, context?: any) => Promise<boolean>,
		message: string | ((value: any, context?: any) => string)
	): ValidationRule => ({
		name: 'async',
		validate: validator,
		message
	})
};

/**
 * Main validator class
 */
export class Validator {
	private schema: ValidationSchema;
	private config: ValidatorConfig;

	constructor(schema: ValidationSchema, config: Partial<ValidatorConfig> = {}) {
		this.schema = schema;
		this.config = {
			stopOnFirstError: false,
			allowUnknownFields: false,
			strict: false,
			...config
		};
	}

	/**
	 * Validate data against schema
	 */
	async validate(data: any, context?: any): Promise<ValidationResult> {
		const errors: ValidationError[] = [];
		const warnings: ValidationError[] = [];

		await this.validateObject(data, this.schema, '', errors, warnings, context);

		return {
			isValid: errors.length === 0,
			errors,
			warnings
		};
	}

	/**
	 * Validate object recursively
	 */
	private async validateObject(
		data: any,
		schema: ValidationSchema,
		prefix: string,
		errors: ValidationError[],
		warnings: ValidationError[],
		context?: any
	): Promise<void> {
		if (!isObject(data)) {
			errors.push({
				field: prefix || 'root',
				rule: 'type',
				message: 'Expected object',
				value: data
			});
			return;
		}

		// Validate each field in schema
		for (const [fieldName, fieldSchema] of Object.entries(schema)) {
			const fieldPath = prefix ? `${prefix}.${fieldName}` : fieldName;
			const fieldValue = data[fieldName];

			if (isArray(fieldSchema)) {
				// Field has validation rules
				await this.validateField(fieldValue, fieldSchema, fieldPath, errors, warnings, context);
			} else if (isObject(fieldSchema)) {
				// Field has nested schema
				if (fieldValue !== undefined) {
					await this.validateObject(fieldValue, fieldSchema, fieldPath, errors, warnings, context);
				}
			}

			// Stop on first error if configured
			if (this.config.stopOnFirstError && errors.length > 0) {
				break;
			}
		}

		// Check for unknown fields
		if (!this.config.allowUnknownFields) {
			for (const fieldName of Object.keys(data)) {
				if (!(fieldName in schema)) {
					const warning: ValidationError = {
						field: prefix ? `${prefix}.${fieldName}` : fieldName,
						rule: 'unknown',
						message: 'Unknown field',
						value: data[fieldName]
					};

					if (this.config.strict) {
						errors.push(warning);
					} else {
						warnings.push(warning);
					}
				}
			}
		}
	}

	/**
	 * Validate individual field
	 */
	private async validateField(
		value: any,
		rules: ValidationRule[],
		fieldPath: string,
		errors: ValidationError[],
		warnings: ValidationError[],
		context?: any
	): Promise<void> {
		for (const rule of rules) {
			try {
				const isValid = await rule.validate(value, context);

				if (!isValid) {
					const message =
						typeof rule.message === 'function' ? rule.message(value, context) : rule.message;

					errors.push({
						field: fieldPath,
						rule: rule.name,
						message,
						value
					});

					// Stop on first error if configured
					if (this.config.stopOnFirstError) {
						break;
					}
				}
			} catch (error) {
				errors.push({
					field: fieldPath,
					rule: rule.name,
					message: `Validation error: ${error.message}`,
					value
				});
			}
		}
	}

	/**
	 * Validate single value
	 */
	static async validateValue(
		value: any,
		rules: ValidationRule[],
		context?: any
	): Promise<ValidationResult> {
		const errors: ValidationError[] = [];
		const warnings: ValidationError[] = [];

		for (const rule of rules) {
			try {
				const isValid = await rule.validate(value, context);

				if (!isValid) {
					const message =
						typeof rule.message === 'function' ? rule.message(value, context) : rule.message;

					errors.push({
						field: 'value',
						rule: rule.name,
						message,
						value
					});
				}
			} catch (error) {
				errors.push({
					field: 'value',
					rule: rule.name,
					message: `Validation error: ${error.message}`,
					value
				});
			}
		}

		return {
			isValid: errors.length === 0,
			errors,
			warnings
		};
	}
}

/**
 * Schema builder for fluent validation
 */
export class SchemaBuilder {
	private schema: ValidationSchema = {};

	/**
	 * Add field validation
	 */
	field(name: string, rules: ValidationRule[]): SchemaBuilder {
		this.schema[name] = rules;
		return this;
	}

	/**
	 * Add nested object validation
	 */
	object(name: string, nestedSchema: ValidationSchema): SchemaBuilder {
		this.schema[name] = nestedSchema;
		return this;
	}

	/**
	 * Build the schema
	 */
	build(): ValidationSchema {
		return this.schema;
	}
}

/**
 * Common validation schemas
 */
export const CommonSchemas = {
	/**
	 * User registration schema
	 */
	userRegistration: new SchemaBuilder()
		.field('email', [ValidationRules.required(), ValidationRules.email()])
		.field('password', [
			ValidationRules.required(),
			ValidationRules.minLength(8),
			ValidationRules.pattern(
				/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
				'Password must contain uppercase, lowercase, and number'
			)
		])
		.field('confirmPassword', [
			ValidationRules.required(),
			ValidationRules.custom(
				(value, context) => value === context?.password,
				'Passwords must match'
			)
		])
		.build(),

	/**
	 * Bookmark schema
	 */
	bookmark: new SchemaBuilder()
		.field('title', [
			ValidationRules.required(),
			ValidationRules.minLength(1),
			ValidationRules.maxLength(200)
		])
		.field('url', [ValidationRules.required(), ValidationRules.url()])
		.field('description', [ValidationRules.maxLength(500)])
		.field('tags', [ValidationRules.array(), ValidationRules.arrayOf([ValidationRules.string()])])
		.build(),

	/**
	 * Settings schema
	 */
	settings: new SchemaBuilder()
		.field('theme', [ValidationRules.required(), ValidationRules.oneOf(['light', 'dark', 'auto'])])
		.field('language', [ValidationRules.required(), ValidationRules.string()])
		.field('notifications', [ValidationRules.object()])
		.build(),

	/**
	 * File upload schema
	 */
	fileUpload: new SchemaBuilder()
		.field('file', [
			ValidationRules.required(),
			ValidationRules.fileSize(10 * 1024 * 1024), // 10MB
			ValidationRules.fileType(['image/jpeg', 'image/png', 'image/webp'])
		])
		.build()
};

/**
 * Form validation helper
 */
export class FormValidator {
	private schema: ValidationSchema;
	private config: ValidatorConfig;
	private validator: Validator;

	constructor(schema: ValidationSchema, config: Partial<ValidatorConfig> = {}) {
		this.schema = schema;
		this.config = { ...config };
		this.validator = new Validator(schema, config);
	}

	/**
	 * Validate form data
	 */
	async validate(formData: FormData | Record<string, any>): Promise<ValidationResult> {
		const data = formData instanceof FormData ? this.formDataToObject(formData) : formData;
		return this.validator.validate(data);
	}

	/**
	 * Validate single field
	 */
	async validateField(fieldName: string, value: any, context?: any): Promise<ValidationResult> {
		const fieldRules = this.schema[fieldName];
		if (!fieldRules || !isArray(fieldRules)) {
			return { isValid: true, errors: [], warnings: [] };
		}

		return Validator.validateValue(value, fieldRules, context);
	}

	/**
	 * Convert FormData to object
	 */
	private formDataToObject(formData: FormData): Record<string, any> {
		const obj: Record<string, any> = {};

		for (const [key, value] of formData.entries()) {
			if (key.endsWith('[]')) {
				// Handle array fields
				const arrayKey = key.slice(0, -2);
				if (!obj[arrayKey]) obj[arrayKey] = [];
				obj[arrayKey].push(value);
			} else {
				obj[key] = value;
			}
		}

		return obj;
	}
}

/**
 * Real-time validation for form fields
 */
export class RealtimeValidator {
	private validators: Map<string, FormValidator> = new Map();
	private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
	private callbacks: Map<string, (result: ValidationResult) => void> = new Map();

	/**
	 * Register field validator
	 */
	register(
		fieldName: string,
		rules: ValidationRule[],
		callback: (result: ValidationResult) => void
	): void {
		const schema = { [fieldName]: rules };
		const validator = new FormValidator(schema);

		this.validators.set(fieldName, validator);
		this.callbacks.set(fieldName, callback);
	}

	/**
	 * Validate field with debouncing
	 */
	validateField(fieldName: string, value: any, delay: number = 300): void {
		// Clear existing timer
		const existingTimer = this.debounceTimers.get(fieldName);
		if (existingTimer) {
			clearTimeout(existingTimer);
		}

		// Set new timer
		const timer = setTimeout(async () => {
			const validator = this.validators.get(fieldName);
			const callback = this.callbacks.get(fieldName);

			if (validator && callback) {
				const result = await validator.validateField(fieldName, value);
				callback(result);
			}
		}, delay);

		this.debounceTimers.set(fieldName, timer);
	}

	/**
	 * Cleanup
	 */
	destroy(): void {
		this.debounceTimers.forEach((timer) => clearTimeout(timer));
		this.debounceTimers.clear();
		this.validators.clear();
		this.callbacks.clear();
	}
}

/**
 * Utility functions
 */
function formatFileSize(bytes: number): string {
	const sizes = ['B', 'KB', 'MB', 'GB'];
	if (bytes === 0) return '0 B';

	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	const size = bytes / Math.pow(1024, i);

	return `${size.toFixed(1)} ${sizes[i]}`;
}

/**
 * Create validation schema from TypeScript interface
 */
export function createSchemaFromInterface<T>(): SchemaBuilder {
	return new SchemaBuilder();
}

/**
 * Validation middleware for API endpoints
 */
export function validationMiddleware(schema: ValidationSchema) {
	return async (data: any): Promise<void> => {
		const validator = new Validator(schema, { strict: true });
		const result = await validator.validate(data);

		if (!result.isValid) {
			const error = new Error('Validation failed');
			(error as any).validationErrors = result.errors;
			throw error;
		}
	};
}

/**
 * Export commonly used validators
 */
export const { required, minLength, maxLength, email, url, pattern, custom } = ValidationRules;
