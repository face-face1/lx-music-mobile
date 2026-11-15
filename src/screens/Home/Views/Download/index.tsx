import { useCallback, useRef, useState } from 'react'
import { FlatList, View } from 'react-native'
import { useI18n } from '@/lang'
import { confirmDialog, createStyle, toast } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import Text from '@/components/common/Text'
import Button from '@/components/common/Button'
import { useDownloadList } from '@/store/downloadList/hook'
import { playList } from '@/core/player/player'
import { retryDownloadTask, removeDownloads } from '@/core/music/downloadManager'
import { LIST_IDS } from '@/config/constant'
import ListItem from './ListItem'
import ListMenu, { type ListMenuType, type Position, type SelectInfo } from './ListMenu'
import LocalList from './LocalList'

type Tab = 'task' | 'local'

export default () => {
  const t = useI18n()
  const theme = useTheme()
  const list = useDownloadList()
  const listMenuRef = useRef<ListMenuType>(null)
  const [tab, setTab] = useState<Tab>('task')
  const [localCount, setLocalCount] = useState(0)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const handleLocalCountChange = useCallback((count: number) => {
    setLocalCount(count)
  }, [])

  const exitSelectMode = useCallback(() => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }, [])

  const enterSelectMode = useCallback((id: string) => {
    setSelectMode(true)
    setSelectedIds(new Set([id]))
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
    setSelectedIds(prev => prev.size >= list.length ? new Set() : new Set(list.map(task => task.id)))
  }, [list])

  const handleDeleteSelected = useCallback(() => {
    const ids = [...selectedIds]
    if (!ids.length) return
    void confirmDialog({
      message: global.i18n.t('download_multi_delete_confirm', { num: ids.length }),
      cancelButtonText: global.i18n.t('cancel_button_text_2'),
      confirmButtonText: global.i18n.t('confirm_button_text'),
    }).then(confirm => {
      if (!confirm) return
      void removeDownloads(ids, true).then(() => {
        toast(global.i18n.t('download_multi_delete_tip', { num: ids.length }))
        exitSelectMode()
      })
    })
  }, [selectedIds, exitSelectMode])

  const handleShowMenu = useCallback((id: string, position: Position) => {
    const task = list.find(task => task.id == id)
    if (!task) return
    listMenuRef.current?.show({
      id: task.id,
      name: task.metadata.musicInfo.name,
      isComplate: task.isComplate,
      isError: task.status == 'error',
      failedCount: list.filter(task => task.status == 'error').length,
    }, position)
  }, [list])

  const handlePressItem = useCallback((id: string) => {
    if (selectMode) {
      toggleSelect(id)
      return
    }
    const completedIds = list.filter(task => task.isComplate)
    const index = completedIds.findIndex(task => task.id == id)
    if (index < 0) {
      const task = list.find(task => task.id == id)
      if (task?.status == 'error') {
        retryDownloadTask(id)
        toast(t('download_retry_started_tip'))
      } else {
        toast(t('download_status_not_complete_tip'))
      }
      return
    }
    void playList(LIST_IDS.DOWNLOAD, index)
  }, [list, t, selectMode, toggleSelect])

  const handlePlay = useCallback((info: SelectInfo) => {
    const completedIds = list.filter(task => task.isComplate)
    const index = completedIds.findIndex(task => task.id == info.id)
    if (index < 0) return
    void playList(LIST_IDS.DOWNLOAD, index)
  }, [list])

  const handleRetry = useCallback((info: SelectInfo) => {
    retryDownloadTask(info.id)
  }, [])

  const handleRemove = useCallback((info: SelectInfo) => {
    void removeDownloads([info.id], true).then(() => {
      toast(global.i18n.t('download_remove_tip'))
    })
  }, [])

  const handleClearFailed = useCallback(() => {
    const failedIds = list.filter(task => task.status == 'error').map(task => task.id)
    if (!failedIds.length) return
    void confirmDialog({
      message: global.i18n.t('download_clear_failed_confirm', { num: failedIds.length }),
      cancelButtonText: global.i18n.t('cancel_button_text_2'),
      confirmButtonText: global.i18n.t('confirm_button_text'),
    }).then(confirm => {
      if (!confirm) return
      void removeDownloads(failedIds, false).then(() => {
        toast(global.i18n.t('download_clear_failed_tip'))
      })
    })
  }, [list])

  const handleSwitchTab = useCallback((target: Tab) => {
    if (target != tab) {
      setTab(target)
      exitSelectMode()
    }
  }, [tab, exitSelectMode])

  const isAllSelected = selectMode && list.length > 0 && selectedIds.size >= list.length

  return (
    <View style={styles.container}>
      <View style={{ ...styles.tabs, backgroundColor: theme['c-primary-background'] }}>
        <Button
          style={{ ...styles.tabBtn, backgroundColor: tab == 'task' ? theme['c-primary'] : 'transparent' }}
          onPress={() => { handleSwitchTab('task') }}
        >
          <Text size={13} color={tab == 'task' ? theme['c-button-font'] : theme['c-font-label']}>
            {t('download_tab_task')}{list.length ? ` (${list.length})` : ''}
          </Text>
        </Button>
        <Button
          style={{ ...styles.tabBtn, backgroundColor: tab == 'local' ? theme['c-primary'] : 'transparent' }}
          onPress={() => { handleSwitchTab('local') }}
        >
          <Text size={13} color={tab == 'local' ? theme['c-button-font'] : theme['c-font-label']}>
            {t('download_tab_local')}{localCount ? ` (${localCount})` : ''}
          </Text>
        </Button>
      </View>
      {
        tab == 'task'
          ? (
            <View style={{ ...styles.content, backgroundColor: theme['c-content-background'] }}>
              {
                list.length
                  ? (
                    <FlatList
                      style={styles.list}
                      data={list}
                      keyExtractor={item => item.id}
                      renderItem={({ item }) => (
                        <ListItem
                          id={item.id}
                          selectMode={selectMode}
                          checked={selectedIds.has(item.id)}
                          onShowMenu={handleShowMenu}
                          onPressItem={handlePressItem}
                        />
                      )}
                    />
                    )
                  : (
                    <View style={styles.empty}>
                      <Text size={13} color={theme['c-font-label']}>{t('download_empty')}</Text>
                    </View>
                    )
              }
            </View>
            )
          : <LocalList onCountChange={handleLocalCountChange} />
      }
      {
        selectMode && tab == 'task'
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
      <ListMenu
        ref={listMenuRef}
        onPlay={handlePlay}
        onRetry={handleRetry}
        onRemove={handleRemove}
        onClearFailed={handleClearFailed}
        onMultiSelect={info => { enterSelectMode(info.id) }}
      />
    </View>
  )
}

const styles = createStyle({
  container: {
    flex: 1,
    flexDirection: 'column',
    width: '100%',
  },
  tabs: {
    flexDirection: 'row',
    alignSelf: 'center',
    flexGrow: 0,
    flexShrink: 0,
    marginTop: 10,
    marginBottom: 4,
    marginLeft: 12,
    marginRight: 12,
    borderRadius: 18,
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 4,
    paddingRight: 4,
  },
  tabBtn: {
    borderRadius: 15,
    paddingLeft: 18,
    paddingRight: 18,
    paddingTop: 7,
    paddingBottom: 7,
    alignItems: 'center',
    justifyContent: 'center',
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
