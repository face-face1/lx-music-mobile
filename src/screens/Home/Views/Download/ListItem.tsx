import { useCallback, useRef } from 'react'
import { View } from 'react-native'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import Button, { type BtnType } from '@/components/common/Button'
import { createStyle } from '@/utils/tools'
import { useI18n } from '@/lang'
import { useDownloadList } from '@/store/downloadList/hook'
import type { Position } from './ListMenu'

export interface ListItemProps {
  id: string
  selectMode: boolean
  checked: boolean
  onShowMenu: (id: string, position: Position) => void
  onPressItem: (id: string) => void
}

export default ({ id, selectMode, checked, onShowMenu, onPressItem }: ListItemProps) => {
  const t = useI18n()
  const theme = useTheme()
  const task = useDownloadList().find(task => task.id == id)
  const buttonRef = useRef<BtnType>(null)

  const setPosition = useCallback(() => {
    if (!task) return
    if (buttonRef.current?.measure) {
      buttonRef.current.measure((fx, fy, width, height, px, py) => {
        onShowMenu(task.id, { x: Math.ceil(px), y: Math.ceil(py), w: Math.ceil(width), h: Math.ceil(height) })
      })
    }
  }, [task, onShowMenu])

  if (!task) return null

  const musicInfo = task.metadata.musicInfo

  let statusText = ''
  let statusColor = theme['c-font-label']
  switch (task.status) {
    case 'waiting':
      statusText = t('download_status_waiting')
      break
    case 'run':
      statusText = `${task.progress}%${task.speed ? ' · ' + task.speed : ''}`
      statusColor = theme['c-primary-font']
      break
    case 'error':
      statusText = task.statusText || t('download_status_error')
      statusColor = theme['c-font']
      break
    case 'completed':
      statusText = `${t('download_status_completed')} · ${task.metadata.ext}${task.total ? ' · ' + (task.total / 1024 / 1024).toFixed(1) + 'MB' : ''}`
      break
  }

  const showProgress = task.status == 'run' && task.progress > 0

  return (
    <Button
      ref={buttonRef}
      style={styles.button}
      onLongPress={setPosition}
      onPress={() => { onPressItem(task.id) }}
    >
      <View style={styles.row}>
        {
          selectMode
            ? (
              <View style={{ ...styles.checkbox, borderColor: checked ? theme['c-primary'] : theme['c-font-label'] }}>
                {checked ? <Text size={12} color={theme['c-primary']}>{'✓'}</Text> : null}
              </View>
              )
            : (
              <View style={{ ...styles.icon, backgroundColor: theme['c-primary-background'] }}>
                <Text size={18} color={theme['c-primary-font']}>{'♪'}</Text>
              </View>
              )
        }
        <View style={styles.info}>
          <Text size={15} color={checked && selectMode ? theme['c-primary-font'] : theme['c-font']} numberOfLines={1}>{musicInfo.name}</Text>
          {
            musicInfo.singer
              ? <Text style={styles.singer} size={12} color={theme['c-font-label']} numberOfLines={1}>{musicInfo.singer}</Text>
              : null
          }
          <Text size={12} color={statusColor} numberOfLines={1}>{statusText}</Text>
          {
            showProgress
              ? (
                <View style={styles.progressTrack}>
                  <View style={{ ...styles.progressFill, width: `${task.progress}%`, backgroundColor: theme['c-primary'] }} />
                </View>
                )
              : null
          }
        </View>
      </View>
    </Button>
  )
}

const styles = createStyle({
  button: {
    paddingLeft: 15,
    paddingRight: 15,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderRadius: 4,
    marginRight: 12,
    marginLeft: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
  },
  singer: {
    marginTop: 2,
    marginBottom: 2,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.2)',
    marginTop: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
})
