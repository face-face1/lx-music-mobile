import { NativeModules } from 'react-native'

const { AppIcon } = NativeModules

export type AppIconName = 'default' | 'blue' | 'purple' | 'orange'

export const getAppIcon = AppIcon.getAppIcon as () => Promise<AppIconName>
export const setAppIcon = AppIcon.setAppIcon as (name: AppIconName) => Promise<boolean>
export const createDesktopShortcut = AppIcon.createDesktopShortcut as (filePath: string) => Promise<boolean>
