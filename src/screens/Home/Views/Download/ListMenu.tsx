import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { useI18n } from '@/lang'
import Menu, { type Menus, type MenuType, type Position } from '@/components/common/Menu'
import { confirmDialog } from '@/utils/tools'

export interface SelectInfo {
  id: string
  name: string
  isComplate: boolean
  isError: boolean
  failedCount: number
}
const initSelectInfo = {}

export interface ListMenuProps {
  onPlay: (info: SelectInfo) => void
  onRetry: (info: SelectInfo) => void
  onRemove: (info: SelectInfo) => void
  onClearFailed: () => void
  onMultiSelect: (info: SelectInfo) => void
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
        { action: 'play', disabled: !selectInfo.isComplate, label: t('play') },
        { action: 'retry', disabled: !selectInfo.isError, label: t('download_retry') },
        { action: 'multiSelect', label: t('download_multi_select') },
        { action: 'remove', label: t('delete') },
        { action: 'clearFailed', disabled: !selectInfo.failedCount, label: t('download_clear_failed') },
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
      case 'retry':
        props.onRetry(selectInfo)
        break
      case 'remove':
        void confirmDialog({
          message: global.i18n.t('download_delete_confirm', { name: selectInfo.name }),
          cancelButtonText: global.i18n.t('cancel_button_text_2'),
          confirmButtonText: global.i18n.t('confirm_button_text'),
        }).then(confirm => {
          if (!confirm) return
          props.onRemove(selectInfo)
        })
        break
      case 'clearFailed':
        props.onClearFailed()
        break
      case 'multiSelect':
        props.onMultiSelect(selectInfo)
        break
    }
  }

  return (
    visible
      ? <Menu ref={menuRef} menus={menus} onPress={handleMenuPress} />
      : null
  )
})
