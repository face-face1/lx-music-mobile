import { memo, useCallback, useEffect, useState } from 'react'

import { StyleSheet, View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import CheckBox from '@/components/common/CheckBox'
import Button from '../../components/Button'
import { useI18n } from '@/lang'
import { toast, TEMP_FILE_PATH } from '@/utils/tools'
import { selectFile, unlink } from '@/utils/fs'
import { useUnmounted } from '@/utils/hooks'
import { type AppIconName, createDesktopShortcut, getAppIcon, setAppIcon } from '@/utils/nativeModules/appIcon'

const LIST = [
  { id: 'default', key: 'setting_basic_app_icon_default' },
  { id: 'blue', key: 'setting_basic_app_icon_blue' },
  { id: 'purple', key: 'setting_basic_app_icon_purple' },
  { id: 'orange', key: 'setting_basic_app_icon_orange' },
] as const

export default memo(() => {
  const t = useI18n()
  const isUnmounted = useUnmounted()
  const [current, setCurrent] = useState<AppIconName>('default')

  useEffect(() => {
    void getAppIcon().then(setCurrent).catch(() => {})
  }, [])

  const handleChange = useCallback((id: AppIconName) => {
    if (id == current) return
    void setAppIcon(id).then(() => {
      setCurrent(id)
      toast(global.i18n.t('app_icon_changed_tip'))
    }).catch((err: Error) => {
      toast(global.i18n.t('app_icon_change_failed_tip', { msg: err.message ?? 'unknown' }), 'long')
    })
  }, [current])

  const handlePickImage = useCallback(() => {
    void selectFile({
      extTypes: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'],
      toPath: TEMP_FILE_PATH,
    }).then(file => {
      if (!file || isUnmounted.current) return
      void createDesktopShortcut(file.data).then(() => {
        if (isUnmounted.current) return
        toast(t('app_icon_shortcut_added_tip'), 'long')
      }).catch((err: Error) => {
        if (isUnmounted.current) return
        toast(t('app_icon_shortcut_failed_tip', { msg: err.message ?? 'unknown' }), 'long')
      }).finally(() => {
        void unlink(file.data).catch(() => {})
      })
    }).catch(() => {})
  }, [t, isUnmounted])

  return (
    <SubTitle title={t('setting_basic_app_icon')}>
      <View style={styles.list}>
        {
          LIST.map(({ id, key }) => (
            <CheckBox
              key={id}
              marginBottom={3}
              check={current == id}
              label={t(key)}
              onChange={() => { handleChange(id) }}
              need
            />
          ))
        }
      </View>
      <View style={styles.row}>
        <Button onPress={handlePickImage}>{t('setting_basic_app_icon_custom')}</Button>
      </View>
    </SubTitle>
  )
})

const styles = StyleSheet.create({
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  row: {
    marginTop: 3,
  },
})
