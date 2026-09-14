import type { ClientType } from '../domain/canonical-node';

export const defaultIosRoutingMode = 'native-bypass' as const;

export type IosRoutingMode = 'native-bypass' | 'tun-dual-stack';

export function resolveIosRoutingMode(value: string | undefined): IosRoutingMode {
  return value === 'tun-dual-stack' ? value : defaultIosRoutingMode;
}

export function usesIosTunDualStack(clientType: ClientType, mode: IosRoutingMode): boolean {
  return clientType === 'ios' && mode === 'tun-dual-stack';
}

export function usesIpv4OnlyDns(clientType: ClientType, mode: IosRoutingMode): boolean {
  return clientType === 'macos' || (clientType === 'ios' && !usesIosTunDualStack(clientType, mode));
}
