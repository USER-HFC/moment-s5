import {NativeEventEmitter, NativeModules} from 'react-native';
export type LutItem = {id: string; name: string; size: number};
export type MomentItem = {id: string; source: string; createdAt: number; complete: boolean; lut?: string; imageUri?: string; videoUri?: string};
export type CameraState = {active: boolean; busy: boolean; ready: boolean; demo: boolean; lut: string | null};
type NativeApi = {connect(): Promise<void>; demo(): void; disconnect(): void; capture(): void; remoteShutter(): void; focus(direction: number): void; setAudio(enabled: boolean): void; setLut(id: string): Promise<string | null>; listLuts(): Promise<LutItem[]>; importLut(uri: string, name: string): Promise<{id: string; name: string}>; activeLut(): Promise<string | null>; diagnostics(): Promise<string>; listMoments(): Promise<MomentItem[]>; getState(): Promise<CameraState>};
export const camera = NativeModules.MomentLumix as NativeApi | undefined;
export const cameraEvents = camera ? new NativeEventEmitter(NativeModules.MomentLumix) : null;
