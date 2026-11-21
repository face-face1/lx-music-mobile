import { memo, forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { View, FlatList, TouchableOpacity } from 'react-native'

import Popup, { type PopupType } from '@/components/common/Popup'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import Menu, { type Menus, type MenuType, type Position } from '@/components/common/Menu'
import MusicAddModal, { type MusicAddModalType } from '@/components/MusicAddModal'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import { usePlayInfo, usePlayMusicInfo } from '@/store/player/hook'
import playerState from '@/store/player/state'
import listState from '@/store/list/state'
import { getList } from '@/core/player/playInfo'
import { playList } from '@/core/player/player'
import { hasDislike } from '@/core/dislikeList'
import { event as downloadEvent } from '@/store/downloadList/event'
import { LIST_IDS } from '@/config/constant'
import { scaleSizeH } from '@/utils/pixelRatio'
import { handleDownloadMusic, handleDislikeMusic, handlePlayLater, handleRemove, handleShare, handleShowMusicSourceDetail } from '@/screens/Home/Views/Mylist/MusicList/listAction'

export interface PlayListPopupType {
  setVisible: (visible: boolean) => void
}

type QueueItem = LX.Music.MusicInfo | LX.Download.ListItem

const ITEM_HEIGHT = scaleSizeH(46)

const getMusic = (item: QueueItem): LX.Music.MusicInfo => 'progress' in item ? item.metadata.musicInfo : item

const noop = () => {}

const PlayListItem = memo(({ musicInfo, index, active, onPress, onShowMenu }: {
  musicInfo: LX.Music.MusicInfo
  index: number
  active: boolean
  onPress: (index: number) => void
  onShowMenu: (musicInfo: LX.Music.MusicInfo, index: number, position: Position) => void
}) => {
  const theme = useTheme()
  const moreButtonRef = useRef<TouchableOpacity>(null)

  const handleShowMenu = useCallback(() => {
    moreButtonRef.current?.measure?.((fx, fy, width, height, px, py) => {
      onShowMenu(musicInfo, index, { x: Math.ceil(px), y: Math.ceil(py), w: Math.ceil(width), h: Math.ceil(height) })
    })
  }, [musicInfo, index, onShowMenu])

  return (
    <View style={styles.listItem}>
      <TouchableOpacity style={styles.listItemLeft} onPress={() => { onPress(index) }} onLongPress={handleShowMenu}>
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
      <TouchableOpacity ref={moreButtonRef} onPress={handleShowMenu} style={styles.moreButton}>
        <Icon name="dots-vertical" style={{ color: theme['c-350'] }} size={14} />
      </TouchableOpacity>
    </View>
  )
})

export default forwardRef<PlayListPopupType>((_, ref) => {
  const popupRef = useRef<PopupType>(null)
  const flatListRef = useRef<FlatList<QueueItem>>(null)
  const menuRef = useRef<MenuType>(null)
  const musicAddRef = useRef<MusicAddModalType>(null)
  const theme = useTheme()
  const playInfo = usePlayInfo()
  const playMusicInfo = usePlayMusicInfo()
  const [list, setList] = useState<QueueItem[]>(() => [...getList(playerState.playInfo.playerListId)])
  const [menuVisible, setMenuVisible] = useState(false)
  const [menus, setMenus] = useState<Menus>([])
  const selectInfoRef = useRef<{ musicInfo: LX.Music.MusicInfo, index: number }>({ musicInfo: null as unknown as LX.Music.MusicInfo, index: -1 })

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

  const handleShowMenu = useCallback((musicInfo: LX.Music.MusicInfo, index: number, position: Position) => {
    selectInfoRef.current = { musicInfo, index }
    const isLocal = musicInfo.source == 'local'
    const listId = playerState.playInfo.playerListId
    const canModifyList = !!listId && listState.allList.some(l => l.id == listId)
    const menu: Array<{ action: string, label: string, disabled?: boolean }> = [
      { action: 'play', label: global.i18n.t('play') },
      { action: 'playLater', label: global.i18n.t('play_later') },
      { action: 'download', disabled: isLocal, label: global.i18n.t('download') },
      { action: 'add', label: global.i18n.t('add_to') },
      { action: 'copyName', label: global.i18n.t('copy_name') },
      { action: 'musicSourceDetail', disabled: isLocal, label: global.i18n.t('music_source_detail') },
      { action: 'dislike', disabled: hasDislike(musicInfo), label: global.i18n.t('dislike') },
    ]
    if (canModifyList) menu.push({ action: 'remove', label: global.i18n.t('delete') })
    setMenus(menu)
    if (menuVisible) menuRef.current?.show(position)
    else {
      setMenuVisible(true)
      requestAnimationFrame(() => {
        menuRef.current?.show(position)
      })
    }
  }, [menuVisible])

  const handleMenuPress = useCallback(({ action }: Menus[number]) => {
    const { musicInfo, index } = selectInfoRef.current
    if (!musicInfo) return
    const listId = playerState.playInfo.playerListId
    if (!listId) return
    switch (action) {
      case 'play':
        handlePlay(index)
        break
      case 'playLater':
        handlePlayLater(listId, musicInfo, [], noop)
        break
      case 'download':
        void handleDownloadMusic(musicInfo, [], noop)
        break
      case 'add':
        musicAddRef.current?.show({ musicInfo, listId: '', isMove: false })
        break
      case 'copyName':
        handleShare(musicInfo)
        break
      case 'musicSourceDetail':
        void handleShowMusicSourceDetail(musicInfo)
        break
      case 'dislike':
        void handleDislikeMusic(musicInfo)
        break
      case 'remove':
        handleRemove(listId, musicInfo, [], noop)
        break
      default:
        break
    }
  }, [handlePlay])

  const currentIndex = playMusicInfo.isTempPlay ? -1 : playInfo.playerPlayIndex

  const renderItem = ({ item, index }: { item: QueueItem, index: number }) => {
    return (
      <PlayListItem
        musicInfo={getMusic(item)}
        index={index}
        active={index == currentIndex}
        onPress={handlePlay}
        onShowMenu={handleShowMenu}
      />
    )
  }

  return (
    <>
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
      { menuVisible ? <Menu ref={menuRef} menus={menus} onPress={handleMenuPress} /> : null }
      <MusicAddModal ref={musicAddRef} />
    </>
  )
})

const styles = createStyle({
  listItem: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    height: ITEM_HEIGHT,
    paddingRight: 2,
    alignItems: 'center',
  },
  listItemLeft: {
    flex: 1,
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  moreButton: {
    height: ITEM_HEIGHT,
    width: 34,
    justifyContent: 'center',
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
