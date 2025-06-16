import type { AxiosInstance } from "axios";
import { OidcInterceptor } from "./Interceptor";
import { OidcInterceptorOptions } from "./types";

export const oidcInterceptor = (
  axiosInstance: AxiosInstance,
  options: OidcInterceptorOptions,
) => {
  return new OidcInterceptor(axiosInstance, options);
};
