import { useRef } from 'react'
import PlayListPopup, { type PlayListPopupType } from '@/screens/PlayDetail/components/PlayListPopup'
import Btn from './Btn'


export default () => {
  const playListPopupRef = useRef<PlayListPopupType>(null)

  return (
    <>
      <Btn icon="menu" onPress={() => { playListPopupRef.current?.setVisible(true) }} />
      <PlayListPopup ref={playListPopupRef} />
    </>
  )
}
