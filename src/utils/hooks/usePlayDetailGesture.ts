import { useMemo, useRef } from 'react'
import {
  PanResponder,
  type PanResponderGestureState,
  type PanResponderInstance,
} from 'react-native'

export interface PlayDetailGestureOptions {
  /** 是否处理水平滑动（左右切歌） */
  enableHorizontal?: boolean
  /** 是否处理竖直滑动（上下切换歌词 / 封面） */
  enableVertical?: boolean
  /**
   * 动态判断当前是否接管本次手势。
   * 返回 false 时不接管，交给下层组件处理（例如歌词列表的滚动）。
   */
  shouldClaim?: (dx: number, dy: number) => boolean
  onDoubleTap?: () => void
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
}

// 判定为一次滑动的位移 / 速度阈值
const SWIPE_DISTANCE = 48
const SWIPE_VELOCITY = 0.35
// 接管手势所需的最小移动距离
const MOVE_THRESHOLD = 12
// 判定为一次点击的最大位移
const TAP_MAX_DISTANCE = 12
// 双击的最大间隔
const DOUBLE_TAP_INTERVAL = 280

/**
 * 播放页手势：左 / 右滑切歌、上 / 下滑切换歌词、双击收藏。
 * 基于 RN 内置 PanResponder，无需新增原生依赖。
 */
export const usePlayDetailGesture = (
  options: PlayDetailGestureOptions,
): PanResponderInstance => {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const infoRef = useRef({
    // 上一次点击（按下）的时间，用于双击判定
    lastTapTime: 0,
    // 本次触摸是否构成双击的第二次点击
    isSecondTap: false,
  })

  return useMemo(() => {
    const info = infoRef.current

    const isTap = (g: PanResponderGestureState) =>
      Math.abs(g.dx) < TAP_MAX_DISTANCE &&
      Math.abs(g.dy) < TAP_MAX_DISTANCE &&
      Math.abs(g.vx) < 0.3 &&
      Math.abs(g.vy) < 0.3

    const handleRelease = (g: PanResponderGestureState) => {
      const opts = optionsRef.current
      if (isTap(g)) {
        if (info.isSecondTap) {
          info.isSecondTap = false
          info.lastTapTime = 0
          opts.onDoubleTap?.()
        }
        return
      }

      info.isSecondTap = false
      info.lastTapTime = 0

      const absDx = Math.abs(g.dx)
      const absDy = Math.abs(g.dy)
      const isHorizontal = absDx > absDy
      const speed = isHorizontal ? Math.abs(g.vx) : Math.abs(g.vy)
      if (Math.max(absDx, absDy) < SWIPE_DISTANCE && speed < SWIPE_VELOCITY) return

      if (isHorizontal) {
        if (!opts.enableHorizontal) return
        if (g.dx < 0) opts.onSwipeLeft?.()
        else opts.onSwipeRight?.()
      } else {
        if (!opts.enableVertical) return
        if (g.dy < 0) opts.onSwipeUp?.()
        else opts.onSwipeDown?.()
      }
    }

    return PanResponder.create({
      // 单击不接管，避免影响页面内的其它点击；仅双击的第二次按下时接管
      onStartShouldSetPanResponder: () => {
        const now = Date.now()
        info.isSecondTap = now - info.lastTapTime < DOUBLE_TAP_INTERVAL
        if (!info.isSecondTap) info.lastTapTime = now
        return info.isSecondTap
      },
      onMoveShouldSetPanResponder: (_evt, g) => {
        const opts = optionsRef.current
        if (opts.shouldClaim && !opts.shouldClaim(g.dx, g.dy)) return false
        const absDx = Math.abs(g.dx)
        const absDy = Math.abs(g.dy)
        const horizontal = opts.enableHorizontal === true && absDx > absDy * 1.5 && absDx > MOVE_THRESHOLD
        const vertical = opts.enableVertical === true && absDy > absDx * 1.5 && absDy > MOVE_THRESHOLD
        return horizontal || vertical
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_evt, g) => { handleRelease(g) },
      onPanResponderTerminate: () => {
        info.isSecondTap = false
        info.lastTapTime = 0
      },
      onShouldBlockNativeResponder: () => true,
    })
  }, [])
}
