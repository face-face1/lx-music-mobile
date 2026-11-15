import { memo } from 'react'
import { View } from 'react-native'

import { updateSetting } from '@/core/common'
import { useSettingValue } from '@/store/setting/hook'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'

import CheckBoxItem from '../../components/CheckBoxItem'

export default memo(() => {
  const t = useI18n()
  const saveLyric = useSettingValue('download.saveLyric')
  const setSaveLyric = (saveLyric: boolean) => {
    updateSetting({ 'download.saveLyric': saveLyric })
  }

  return (
    <View style={styles.content}>
      <CheckBoxItem check={saveLyric} onChange={setSaveLyric} label={t('setting_basic_download_save_lyric')} />
    </View>
  )
})


const styles = createStyle({
  content: {
    marginTop: 5,
  },
})
