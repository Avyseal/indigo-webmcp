export {
	hasWebMcpModelContext,
	type WebMcpDocumentLike,
	type WebMcpModelContextLike,
	type WebMcpRegisterToolLike,
} from "./environment.js";
export {
	type IndigoWebMcpCapability,
	type IndigoWebMcpContext,
	type IndigoWebMcpProjection,
	type IndigoWebMcpSurfaceName,
	toWebMcpToolDefinition,
} from "./projection.js";
export {
	type RegisterWebMcpToolSetOptions,
	type WebMcpJsonPrimitive,
	type WebMcpJsonValue,
	WebMcpRegistrationError,
	type WebMcpRegistrationErrorCode,
	type WebMcpToolAnnotations,
	type WebMcpToolDefinition,
	type WebMcpToolExecutionRequest,
	type WebMcpToolExecutor,
	type WebMcpToolSetRegistration,
} from "./tool-contract.js";
export {
	createIndigoWebMcpSurface,
	type CreateIndigoWebMcpSurfaceOptions,
	type IndigoWebMcpExecutionRequest,
	type IndigoWebMcpExecutor,
	type IndigoWebMcpSurface,
	type IndigoWebMcpSyncResult,
	type IndigoWebMcpSyncStatus,
} from "./surface.js";
export { registerWebMcpToolSet } from "./tool-set.js";
