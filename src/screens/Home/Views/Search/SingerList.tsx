import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { FlatList, RefreshControl, TouchableOpacity, View, type FlatListProps } from 'react-native'

import { search } from '@/core/search/music'
import { type Source } from '@/store/search/music/state'
import { createStyle } from '@/utils/tools'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'

export interface SingerListType {
  loadList: (text: string, source: Source) => void
}

interface SingerListProps {
  onSingerPress: (name: string) => void
}

interface SingerItem {
  name: string
  count: number
}

const ITEM_HEIGHT = 52

const getItemLayout: FlatListProps<SingerItem>['getItemLayout'] = (data, index) => ({
  length: ITEM_HEIGHT,
  offset: ITEM_HEIGHT * index,
  index,
})

// 复用歌曲搜索结果，按歌手聚合
const aggregateSingers = (list: LX.Music.MusicInfoOnline[]): SingerItem[] => {
  const map = new Map<string, number>()
  for (const item of list) {
    for (const part of item.singer.split('/')) {
      const name = part.trim()
      if (!name) continue
      map.set(name, (map.get(name) ?? 0) + 1)
    }
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

export default forwardRef<SingerListType, SingerListProps>(({ onSingerPress }, ref) => {
  const t = useI18n()
  const theme = useTheme()
  const [list, setList] = useState<SingerItem[]>([])
  const [status, setStatus] = useState<'loading' | 'idle' | 'refreshing' | 'error'>('idle')
  const searchInfoRef = useRef<{ text: string, source: Source }>({ text: '', source: 'kw' })
  const isUnmountedRef = useRef(false)

  useEffect(() => {
    isUnmountedRef.current = false
    return () => {
      isUnmountedRef.current = true
    }
  }, [])

  const handleLoad = useCallback(async(text: string, source: Source, refreshing = false) => {
    searchInfoRef.current = { text, source }
    setStatus(refreshing ? 'refreshing' : 'loading')
    try {
      const result = await search(text, 1, source)
      if (isUnmountedRef.current) return
      setList(aggregateSingers(result))
      setStatus('idle')
    } catch {
      if (isUnmountedRef.current) return
      setStatus('error')
    }
  }, [])

  useImperativeHandle(ref, () => ({
    loadList(text, source) {
      setList([])
      void handleLoad(text, source)
    },
  }), [handleLoad])

  const handleRefresh = useCallback(() => {
    void handleLoad(searchInfoRef.current.text, searchInfoRef.current.source, true)
  }, [handleLoad])

  const renderItem = useCallback(({ item }: { item: SingerItem }) => (
    <TouchableOpacity style={styles.row} activeOpacity={0.6} onPress={() => { onSingerPress(item.name) }}>
      <Text color={theme['c-font']} size={14} numberOfLines={1} style={styles.name}>{item.name}</Text>
      <Text color={theme['c-font-label']} size={12}>{t('search_singer_songs', { num: item.count })}</Text>
    </TouchableOpacity>
  ), [onSingerPress, theme, t])

  const refreshControl = (
    <RefreshControl
      colors={[theme['c-primary']]}
      refreshing={status == 'refreshing'}
      onRefresh={handleRefresh}
    />
  )

  const footerComponent = status == 'loading' || status == 'error' || !list.length
    ? (
        <View style={styles.footer}>
          <Text
            color={theme['c-font-label']}
            size={13}
            onPress={status == 'error' ? handleRefresh : undefined}
          >{status == 'loading' ? t('list_loading') : status == 'error' ? t('list_error') : t('no_item')}</Text>
        </View>
      )
    : null

  return (
    <FlatList
      style={styles.list}
      data={list}
      renderItem={renderItem}
      keyExtractor={(item) => item.name}
      getItemLayout={getItemLayout}
      refreshControl={refreshControl}
      ListFooterComponent={footerComponent}
    />
  )
})

const styles = createStyle({
  list: {
    flexGrow: 1,
    flexShrink: 1,
  },
  row: {
    height: ITEM_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 15,
    paddingRight: 15,
  },
  name: {
    flexShrink: 1,
    marginRight: 12,
  },
  footer: {
    padding: 10,
    alignItems: 'center',
  },
})
