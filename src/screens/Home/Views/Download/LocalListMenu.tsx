import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { useI18n } from '@/lang'
import Menu, { type Menus, type MenuType, type Position } from '@/components/common/Menu'
import { confirmDialog } from '@/utils/tools'

export interface SelectInfo {
  id: string
  name: string
}
const initSelectInfo = {}

export interface ListMenuProps {
  onPlay: (info: SelectInfo) => void
  onPlayAll: () => void
  onRemove: (info: SelectInfo) => void
  onBatchRemove: (info: SelectInfo) => void
}
export interface ListMenuType {
  show: (selectInfo: SelectInfo, position: Position) => void
}

export type {
  Position,
}

export default forwardRef<ListMenuType, ListMenuProps>((props, ref) => {
  const t = useI18n()
  const [visible, setVisible] = useState(false)
  const menuRef = useRef<MenuType>(null)
  const selectInfoRef = useRef<SelectInfo>(initSelectInfo as SelectInfo)
  const [menus, setMenus] = useState<Menus>([])

  useImperativeHandle(ref, () => ({
    show(selectInfo, position) {
      selectInfoRef.current = selectInfo
      setMenus([
        { action: 'play', label: t('play') },
        { action: 'playAll', label: t('play_all') },
        { action: 'remove', label: t('download_local_remove') },
        { action: 'batchRemove', label: t('download_local_batch_delete') },
      ])
      if (visible) menuRef.current?.show(position)
      else {
        setVisible(true)
        requestAnimationFrame(() => {
          menuRef.current?.show(position)
        })
      }
    },
  }))

  const handleMenuPress = ({ action }: typeof menus[number]) => {
    const selectInfo = selectInfoRef.current
    switch (action) {
      case 'play':
        props.onPlay(selectInfo)
        break
      case 'playAll':
        props.onPlayAll()
        break
      case 'batchRemove':
        props.onBatchRemove(selectInfo)
        break
      case 'remove':
        void confirmDialog({
          message: global.i18n.t('download_local_remove_confirm', { name: selectInfo.name }),
          cancelButtonText: global.i18n.t('cancel_button_text_2'),
          confirmButtonText: global.i18n.t('confirm_button_text'),
        }).then(confirm => {
          if (!confirm) return
          props.onRemove(selectInfo)
        })
        break
    }
  }

  return (
    visible
      ? <Menu ref={menuRef} menus={menus} onPress={handleMenuPress} />
      : null
  )
})
