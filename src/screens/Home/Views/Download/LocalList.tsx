import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, RefreshControl, View } from 'react-native'
import Text from '@/components/common/Text'
import Button, { type BtnType } from '@/components/common/Button'
import { confirmDialog, createStyle, toast } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { playList } from '@/core/player/player'
import { setTempList } from '@/core/list'
import { DOWNLOAD_DIR, getLyricPath } from '@/core/music/downloadManager'
import { scanAudioFiles } from '@/utils/localMediaMetadata'
import { unlink, type FileType } from '@/utils/fs'
import { LIST_IDS } from '@/config/constant'
import LocalListMenu, { type ListMenuType as LocalListMenuType, type Position, type SelectInfo } from './LocalListMenu'

const TEMP_LIST_ID = 'download_local'
const AUDIO_EXTS = ['mp3', 'flac', 'wav', 'ape', 'ogg', 'm4a', 'aac', 'opus']

export interface LocalMusicItem {
  musicInfo: LX.Music.MusicInfoLocal
  size: number
}

export interface LocalListProps {
  onCountChange?: (count: number) => void
}

const formatSize = (size: number) => {
  if (!Number.isFinite(size) || size <= 0) return ''
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`
  return `${(size / 1024 / 1024).toFixed(1)}MB`
}

const buildItem = (file: FileType): LocalMusicItem | null => {
  if (!file.isFile) return null
  const dotIndex = file.name.lastIndexOf('.')
  if (dotIndex < 1) return null
  const ext = file.name.substring(dotIndex + 1).toLowerCase()
  if (!AUDIO_EXTS.includes(ext)) return null
  const baseName = file.name.substring(0, dotIndex)
  let name = baseName
  let singer = ''
  const sepIndex = baseName.indexOf(' - ')
  if (sepIndex > 0) {
    singer = baseName.substring(0, sepIndex)
    name = baseName.substring(sepIndex + 3)
  }
  return {
    musicInfo: {
      id: file.path,
      name: name || baseName,
      singer,
      source: 'local',
      interval: null,
      meta: {
        albumName: '',
        filePath: file.path,
        songId: file.path,
        picUrl: '',
        ext,
      },
    },
    size: file.size,
  }
}

const scanLocalList = async(): Promise<LocalMusicItem[]> => {
  const files = await scanAudioFiles(DOWNLOAD_DIR)
  return files
    .map(buildItem)
    .filter((item): item is LocalMusicItem => item != null)
    .sort((a, b) => a.musicInfo.name.localeCompare(b.musicInfo.name, 'zh-CN'))
}

export default ({ onCountChange }: LocalListProps) => {
  const t = useI18n()
  const theme = useTheme()
  const [list, setList] = useState<LocalMusicItem[]>([])
  const [refreshing, setRefreshing] = useState(true)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const listMenuRef = useRef<LocalListMenuType>(null)
  const listRef = useRef<LocalMusicItem[]>([])

  const refresh = useCallback(async() => {
    setRefreshing(true)
    try {
      const items = await scanLocalList()
      listRef.current = items
      setList(items)
    } catch {
      // 目录不存在或读取失败都按空列表处理
      listRef.current = []
      setList([])
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    onCountChange?.(list.length)
  }, [list.length, onCountChange])

  const playAt = useCallback((index: number) => {
    if (!listRef.current.length) return
    void setTempList(TEMP_LIST_ID, listRef.current.map(item => item.musicInfo)).then(() => {
      void playList(LIST_IDS.TEMP, index)
    })
  }, [])

  const exitSelectMode = useCallback(() => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }, [])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => prev.size >= listRef.current.length ? new Set() : new Set(listRef.current.map(item => item.musicInfo.id)))
  }, [])

  const handleDeleteSelected = useCallback(() => {
    const ids = [...selectedIds]
    if (!ids.length) return
    void confirmDialog({
      message: global.i18n.t('download_local_batch_delete_confirm', { num: ids.length }),
      cancelButtonText: global.i18n.t('cancel_button_text_2'),
      confirmButtonText: global.i18n.t('confirm_button_text'),
    }).then(confirm => {
      if (!confirm) return
      void Promise.allSettled(ids.map(async id => {
        await unlink(id)
        // 一并清理同名歌词文件（失败不影响主文件删除结果）
        await unlink(getLyricPath(id)).catch(() => {})
      })).then(results => {
        const ok = results.filter(r => r.status == 'fulfilled').length
        if (ok) toast(global.i18n.t('download_local_batch_delete_tip', { num: ok }))
        exitSelectMode()
        void refresh()
      })
    })
  }, [selectedIds, refresh, exitSelectMode])

  const handleShowMenu = useCallback((id: string, position: Position) => {
    const item = listRef.current.find(item => item.musicInfo.id == id)
    if (!item) return
    listMenuRef.current?.show({
      id,
      name: item.musicInfo.name,
    }, position)
  }, [])

  const handlePressItem = useCallback((id: string) => {
    if (selectMode) {
      toggleSelect(id)
      return
    }
    const index = listRef.current.findIndex(item => item.musicInfo.id == id)
    if (index < 0) return
    playAt(index)
  }, [selectMode, toggleSelect, playAt])

  const handlePlay = useCallback((info: SelectInfo) => {
    const index = listRef.current.findIndex(item => item.musicInfo.id == info.id)
    if (index < 0) return
    playAt(index)
  }, [playAt])

  const handlePlayAll = useCallback(() => {
    playAt(0)
  }, [playAt])

  const handleRemove = useCallback((info: SelectInfo) => {
    void unlink(info.id).then(() => {
      // 一并清理同名歌词文件
      void unlink(getLyricPath(info.id)).catch(() => {})
      toast(global.i18n.t('download_local_remove_tip'))
      void refresh()
    }).catch(() => {
      toast(global.i18n.t('download_local_remove_failed_tip'))
    })
  }, [refresh])

  const handleBatchRemove = useCallback((info: SelectInfo) => {
    setSelectMode(true)
    setSelectedIds(new Set([info.id]))
  }, [])

  const refreshControl = (
    <RefreshControl
      colors={[theme['c-primary']]}
      refreshing={refreshing}
      onRefresh={refresh}
      progressBackgroundColor={theme['c-content-background']}
    />
  )

  const isAllSelected = list.length > 0 && selectedIds.size >= list.length

  return (
    <View style={styles.container}>
      <View style={{ ...styles.content, backgroundColor: theme['c-content-background'] }}>
        <FlatList
          style={styles.list}
          data={list}
          keyExtractor={item => item.musicInfo.id}
          refreshControl={refreshControl}
          ListEmptyComponent={(
            <View style={styles.empty}>
              <Text size={13} color={theme['c-font-label']}>{t('download_local_empty')}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <LocalListItem
              item={item}
              theme={theme}
              selectMode={selectMode}
              checked={selectedIds.has(item.musicInfo.id)}
              onShowMenu={handleShowMenu}
              onPressItem={handlePressItem}
            />
          )}
        />
      </View>
      {
        selectMode
          ? (
            <View style={{ ...styles.selectBar, backgroundColor: theme['c-content-background'] }}>
              <Button style={styles.selectBarBtn} onPress={toggleSelectAll}>
                <Text size={14} color={theme['c-primary-font']}>{isAllSelected ? t('download_local_deselect_all') : t('download_local_select_all')}</Text>
              </Button>
              <Button style={styles.selectBarBtn} onPress={handleDeleteSelected}>
                <Text size={14} color={selectedIds.size ? theme['c-primary-font'] : theme['c-font-label']}>
                  {t('download_local_delete_selected')}{selectedIds.size ? ` (${selectedIds.size})` : ''}
                </Text>
              </Button>
              <Button style={styles.selectBarBtn} onPress={exitSelectMode}>
                <Text size={14} color={theme['c-font']}>{t('cancel')}</Text>
              </Button>
            </View>
            )
          : null
      }
      <LocalListMenu
        ref={listMenuRef}
        onPlay={handlePlay}
        onPlayAll={handlePlayAll}
        onRemove={handleRemove}
        onBatchRemove={handleBatchRemove}
      />
    </View>
  )
}

interface LocalListItemProps {
  item: LocalMusicItem
  theme: ReturnType<typeof useTheme>
  selectMode: boolean
  checked: boolean
  onShowMenu: (id: string, position: Position) => void
  onPressItem: (id: string) => void
}

const LocalListItem = ({ item, theme, selectMode, checked, onShowMenu, onPressItem }: LocalListItemProps) => {
  const buttonRef = useRef<BtnType>(null)
  const musicInfo = item.musicInfo

  const setPosition = useCallback(() => {
    if (buttonRef.current?.measure) {
      buttonRef.current.measure((fx, fy, width, height, px, py) => {
        onShowMenu(musicInfo.id, { x: Math.ceil(px), y: Math.ceil(py), w: Math.ceil(width), h: Math.ceil(height) })
      })
    }
  }, [musicInfo.id, onShowMenu])

  const sizeText = formatSize(item.size)
  const metaText = [musicInfo.meta.ext.toUpperCase(), sizeText].filter(Boolean).join(' · ')

  return (
    <Button
      ref={buttonRef}
      style={styles.button}
      onLongPress={setPosition}
      onPress={() => { onPressItem(musicInfo.id) }}
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
                <Text size={18} color={theme['c-primary-font']}>{'♫'}</Text>
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
          {
            metaText
              ? <Text size={12} color={theme['c-font-label']} numberOfLines={1}>{metaText}</Text>
              : null
          }
        </View>
      </View>
    </Button>
  )
}

const styles = createStyle({
  container: {
    flex: 1,
    flexDirection: 'column',
    width: '100%',
  },
  content: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  selectBar: {
    flexDirection: 'row',
    width: '100%',
    flexGrow: 0,
    borderTopWidth: 0.5,
  },
  selectBarBtn: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 14,
  },
})
