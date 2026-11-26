/** Three coherent parameter sets for uncertainty ranges (§5.5). */
export interface ParamSet {
  P: number;
  k: number;
  purifierDerate: number;
  aWindowsShutNormal: number;
  n95Residual: number;
}

export const CONSERVATIVE: ParamSet = {
  P: 0.9,
  k: 0.2,
  purifierDerate: 0.3,
  aWindowsShutNormal: 1.0,
  n95Residual: 0.4,
};

export const BASE: ParamSet = {
  P: 0.8,
  k: 0.3,
  purifierDerate: 0.5,
  aWindowsShutNormal: 0.7,
  n95Residual: 0.2,
};

export const OPTIMISTIC: ParamSet = {
  P: 0.7,
  k: 0.4,
  purifierDerate: 0.7,
  aWindowsShutNormal: 0.5,
  n95Residual: 0.1,
};

export const ALL_PARAM_SETS: readonly ParamSet[] = [CONSERVATIVE, BASE, OPTIMISTIC] as const;
