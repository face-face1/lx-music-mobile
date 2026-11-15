import { useCallback } from 'react'
import { View } from 'react-native'
import Button from '@/components/common/Button'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import boardState from '@/store/leaderboard/state'
import { handlePlay } from './listAction'

export default () => {
  const t = useI18n()
  const theme = useTheme()

  const handlePlayAll = useCallback(() => {
    const listDetailInfo = boardState.listDetailInfo
    if (!listDetailInfo.list.length) return
    void handlePlay(listDetailInfo.id, listDetailInfo.list, 0)
  }, [])

  return (
    <View style={styles.bar}>
      <Button
        style={{ ...styles.button, backgroundColor: theme['c-primary-background'] }}
        onPress={handlePlayAll}
      >
        <Text size={13} color={theme['c-primary-font']}>{t('play_all')}</Text>
      </Button>
    </View>
  )
}

const styles = createStyle({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    flexGrow: 0,
    flexShrink: 0,
    paddingTop: 5,
    paddingBottom: 5,
    paddingLeft: 15,
    paddingRight: 15,
  },
  button: {
    paddingTop: 7,
    paddingBottom: 7,
    paddingLeft: 16,
    paddingRight: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
