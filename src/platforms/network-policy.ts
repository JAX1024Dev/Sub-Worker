import type { ClientType } from '../domain/canonical-node';

export const defaultIosRoutingMode = 'native-bypass' as const;
export const defaultMacosRoutingMode = 'ipv4-compatible' as const;

export type IosRoutingMode = 'native-bypass' | 'tun-dual-stack';
export type MacosRoutingMode = 'ipv4-compatible' | 'fakeip-dual-stack';

export interface NetworkRoutingOptions {
  iosRoutingMode?: IosRoutingMode;
  macosRoutingMode?: MacosRoutingMode;
}

export interface ResolvedNetworkRoutingModes {
  iosRoutingMode: IosRoutingMode;
  macosRoutingMode: MacosRoutingMode;
}

export function resolveIosRoutingMode(value: string | undefined): IosRoutingMode {
  return value === 'tun-dual-stack' ? value : defaultIosRoutingMode;
}

export function resolveMacosRoutingMode(value: string | undefined): MacosRoutingMode {
  return value === 'fakeip-dual-stack' ? value : defaultMacosRoutingMode;
}

export function resolveNetworkRoutingModes(
  options: NetworkRoutingOptions,
): ResolvedNetworkRoutingModes {
  return {
    iosRoutingMode: options.iosRoutingMode ?? defaultIosRoutingMode,
    macosRoutingMode: options.macosRoutingMode ?? defaultMacosRoutingMode,
  };
}

export function usesIosTunDualStack(clientType: ClientType, mode: IosRoutingMode): boolean {
  return clientType === 'ios' && mode === 'tun-dual-stack';
}

export function usesMacosFakeIpDualStack(clientType: ClientType, mode: MacosRoutingMode): boolean {
  return clientType === 'macos' && mode === 'fakeip-dual-stack';
}

export function usesIpv4OnlyDns(
  clientType: ClientType,
  iosRoutingMode: IosRoutingMode,
  macosRoutingMode: MacosRoutingMode,
): boolean {
  return (
    (clientType === 'macos' && !usesMacosFakeIpDualStack(clientType, macosRoutingMode)) ||
    (clientType === 'ios' && !usesIosTunDualStack(clientType, iosRoutingMode))
  );
}
