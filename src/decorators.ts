import * as _ from 'lodash'
import {
  OperationObject,
  ReferenceObject,
  ResponsesObject,
  SchemaObject
} from 'openapi3-ts'
import 'reflect-metadata'

import { getContentType, getStatusCode, IRoute } from './index'

const OPEN_API_KEY = Symbol('routing-controllers-openapi:OpenAPI')

export type OpenAPIParam =
  | Partial<OperationObject>
  | ((source: OperationObject, route: IRoute) => OperationObject)

/**
 * Supplement action with additional OpenAPI Operation keywords.
 *
 * @param spec OpenAPI Operation object that is merged into the schema derived
 * from routing-controllers decorators. In case of conflicts, keywords defined
 * here overwrite the existing ones. Alternatively you can supply a function
 * that receives as parameters the existing Operation and target route,
 * returning an updated Operation.
 */
export function OpenAPI(spec: OpenAPIParam) {
  return (target: object, key: string) => {
    const currentMeta = getOpenAPIMetadata(target, key)
    setOpenAPIMetadata([spec, ...currentMeta], target, key)
  }
}

/**
 * Apply the keywords defined in @OpenAPI decorator to its target route.
 */
export function applyOpenAPIDecorator(
  originalOperation: OperationObject,
  route: IRoute
): OperationObject {
  const { action } = route
  const openAPIParams = getOpenAPIMetadata(
    action.target.prototype,
    action.method
  )
  return openAPIParams.reduce((acc: OperationObject, oaParam: OpenAPIParam) => {
    return _.isFunction(oaParam)
      ? oaParam(acc, route)
      : _.merge({}, acc, oaParam)
  }, originalOperation) as OperationObject
}

/**
 * Get the OpenAPI Operation object stored in given target property's metadata.
 */
function getOpenAPIMetadata(target: object, key: string): OpenAPIParam[] {
  return Reflect.getMetadata(OPEN_API_KEY, target.constructor, key) || []
}

/**
 * Store given OpenAPI Operation object into target property's metadata.
 */
function setOpenAPIMetadata(
  value: OpenAPIParam[],
  target: object,
  key: string
) {
  return Reflect.defineMetadata(OPEN_API_KEY, value, target.constructor, key)
}

/**
 * Supplement action with response body type annotation.
 */
export function ResponseSchema(
  responseClass: Function | string, // tslint:disable-line
  options: {
    contentType?: string
    description?: string
    statusCode?: string | number
    isArray?: boolean
  } = {}
) {
  const setResponseSchema = (source: OperationObject, route: IRoute) => {
    const contentType = options.contentType || getContentType(route)
    const description = options.description || ''
    const isArray = options.isArray || false
    const statusCode = (options.statusCode || getStatusCode(route)) + ''

    let responseSchemaName = ''
    if (typeof responseClass === 'function' && responseClass.name) {
      responseSchemaName = responseClass.name
    } else if (typeof responseClass === 'string') {
      responseSchemaName = responseClass
    }

    if (responseSchemaName) {
      const reference: ReferenceObject = {
        $ref: `#/components/schemas/${responseSchemaName}`
      }
      const schema: SchemaObject = isArray
        ? { items: reference, type: 'array' }
        : reference
      const responses: ResponsesObject = {
        [statusCode]: {
          content: {
            [contentType]: {
              schema
            }
          },
          description
        }
      }

      return _.merge({}, source, { responses })
    }

    return source
  }

  return OpenAPI(setResponseSchema)
}
