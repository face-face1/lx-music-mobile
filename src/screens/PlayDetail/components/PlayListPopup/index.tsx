import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { View, FlatList, TouchableOpacity } from 'react-native'

import Popup, { type PopupType } from '@/components/common/Popup'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import { usePlayInfo, usePlayMusicInfo } from '@/store/player/hook'
import playerState from '@/store/player/state'
import { getList } from '@/core/player/playInfo'
import { playList } from '@/core/player/player'
import { event as downloadEvent } from '@/store/downloadList/event'
import { LIST_IDS } from '@/config/constant'
import { scaleSizeH } from '@/utils/pixelRatio'

export interface PlayListPopupType {
  setVisible: (visible: boolean) => void
}

type QueueItem = LX.Music.MusicInfo | LX.Download.ListItem

const ITEM_HEIGHT = scaleSizeH(46)

const getMusic = (item: QueueItem): LX.Music.MusicInfo => 'progress' in item ? item.metadata.musicInfo : item

export default forwardRef<PlayListPopupType>((_, ref) => {
  const popupRef = useRef<PopupType>(null)
  const flatListRef = useRef<FlatList<QueueItem>>(null)
  const theme = useTheme()
  const playInfo = usePlayInfo()
  const playMusicInfo = usePlayMusicInfo()
  const [list, setList] = useState<QueueItem[]>(() => [...getList(playerState.playInfo.playerListId)])

  const refreshList = useCallback(() => {
    setList([...getList(playerState.playInfo.playerListId)])
  }, [])

  const playerListId = playInfo.playerListId
  useEffect(() => {
    refreshList()
  }, [playerListId, refreshList])

  useEffect(() => {
    const handleMyListUpdate = (ids: string[]) => {
      const listId = playerState.playInfo.playerListId
      if (listId && ids.includes(listId)) refreshList()
    }
    const handleDownloadUpdate = () => {
      if (playerState.playInfo.playerListId == LIST_IDS.DOWNLOAD) refreshList()
    }
    global.app_event.on('myListMusicUpdate', handleMyListUpdate)
    downloadEvent.on('download_list_changed', handleDownloadUpdate)
    return () => {
      global.app_event.off('myListMusicUpdate', handleMyListUpdate)
      downloadEvent.off('download_list_changed', handleDownloadUpdate)
    }
  }, [refreshList])

  const scrollToCurrent = useCallback(() => {
    const index = playerState.playInfo.playerPlayIndex
    if (index < 1) return
    setTimeout(() => {
      try {
        flatListRef.current?.scrollToIndex({ index, animated: false })
      } catch { /* ignore */ }
    }, 320)
  }, [])

  useImperativeHandle(ref, () => ({
    setVisible(visible: boolean) {
      popupRef.current?.setVisible(visible)
      if (visible) {
        refreshList()
        scrollToCurrent()
      }
    },
  }), [refreshList, scrollToCurrent])

  const handlePlay = useCallback((index: number) => {
    const listId = playerState.playInfo.playerListId
    if (!listId) return
    void playList(listId, index)
  }, [])

  const currentIndex = playMusicInfo.isTempPlay ? -1 : playInfo.playerPlayIndex

  const renderItem = ({ item, index }: { item: QueueItem, index: number }) => {
    const musicInfo = getMusic(item)
    const active = index == currentIndex
    return (
      <TouchableOpacity style={styles.listItem} onPress={() => { handlePlay(index) }}>
        {
          active
            ? <Icon style={styles.sn} name="play-outline" size={13} color={theme['c-primary-font']} />
            : <Text style={styles.sn} size={13} color={theme['c-300']}>{index + 1}</Text>
        }
        <View style={styles.itemInfo}>
          <Text color={active ? theme['c-primary-font'] : theme['c-font']} numberOfLines={1}>{musicInfo.name}</Text>
          <Text style={styles.itemSinger} size={11} color={active ? theme['c-primary-alpha-200'] : theme['c-500']} numberOfLines={1}>{musicInfo.singer}</Text>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <Popup ref={popupRef} title={`${global.i18n.t('play_current_list')} (${list.length})`}>
      {
        list.length
          ? (
            <FlatList
              ref={flatListRef}
              data={list}
              keyExtractor={(item, index) => `${getMusic(item).id}_${index}`}
              renderItem={renderItem}
              getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
              onScrollToIndexFailed={({ index }) => {
                setTimeout(() => {
                  try {
                    flatListRef.current?.scrollToIndex({ index, animated: false })
                  } catch { /* ignore */ }
                }, 300)
              }}
            />
            )
          : (
            <View style={styles.empty}>
              <Text color={theme['c-500']}>{global.i18n.t('play_current_list_empty')}</Text>
            </View>
            )
      }
    </Popup>
  )
})

const styles = createStyle({
  listItem: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    height: ITEM_HEIGHT,
    paddingRight: 15,
    alignItems: 'center',
  },
  sn: {
    width: 38,
    textAlign: 'center',
    paddingLeft: 3,
    paddingRight: 3,
  },
  itemInfo: {
    flexGrow: 1,
    flexShrink: 1,
    paddingRight: 2,
  },
  itemSinger: {
    paddingTop: 3,
  },
  empty: {
    height: scaleSizeH(120),
    alignItems: 'center',
    justifyContent: 'center',
  },
})
