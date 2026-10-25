# 相册重新设计

模拟器 `moment_s5_task_e_api35`（API 35，无实体相机）。截图都是合成演示画面，没有个人信息。

## 做了什么

相册改为三列网格。点开后是全屏查看器：左右滑动换照片；双指放大后同一根手指改为移动画面，不再翻页。动态照片用「播放」按钮播放，播完回到静态图。

更换 LUT 从底部面板进行，照片留在面板上方。预览用原片生成，不写盘。保存始终从 `original.jpg` 重新生成 `rendered.jpg`，不改原片，并更新 `moment.json`。

动态照片同样更换静态图的 LUT。只要 `motion.mp4` 已存在，就用新的静态图和原来的视频重新封装 `MOMENT_MP.jpg`。视频字节不重新调色。片段还没完成时只更新静态图和元数据。

照片信息包括：来源（App 快门 / 机身快门同步 / 演示）和连接方式、机身 SD 卡文件名、拍摄时间、EXIF（机型、镜头、ISO、快门、光圈、焦距、尺寸）、当前 LUT、App 内目录、是否已导出到 `DCIM/MomentS5` 及路径、各文件大小。导出、删除（只删 App 内副本）、分享，以及失败或未完成提示都还在。

## 演示里核实过的事

- 网格里同时有普通照片和带 LIVE 标记的动态照片。查看器从 3/11 滑到 4/11，再滑回 3/11。
- 一张普通照片套用 Classic Chrome 后，标题变为该 LUT，信息里出现 LUT 成片 87 KB；导出后系统相册为 `已导出 · DCIM/MomentS5/<id>.jpg`。
- 一张动态照片套用 Velvia 后，`original.jpg`（63585 字节）和 `motion.mp4`（120791 字节）的修改时间仍是拍摄时。新生成 `rendered.jpg`。`MOMENT_MP.jpg` 被重写，并且里面包含原来的 mp4，不包含原片字节。
- 删除确认框点了「取消」，照片还在。分享只打开了选择文件的对话框，然后取消。

演示 JPEG 没有 EXIF。机型、镜头、ISO、快门、光圈、焦距显示为「—」。尺寸 2400 × 1600 来自位图边界，不是 EXIF。

## 测试

- `tools/check-core.sh`：PASS 72 core，6 deletion，11 LUT import
- `tools/check-usb.sh`：PASS 18
- `tools/check-wifi.sh`：PASS 111
- `tools/check-scopes.sh`：PASS 97
- `mobile`：`tsc --noEmit` 通过；Jest 12 套、84 项通过；eslint 0 error
- `bash ./gradlew assembleRelease`：BUILD SUCCESSFUL

## 截图

- `00-demo-camera.png` 演示取景
- `01-grid.png` 网格
- `02-viewer-still.png` 普通照片查看器
- `03-after-swipe.png` 滑到下一张（4/11）
- `04-info.png` `05-info-storage.png` 信息与存储位置（套用 LUT 之前）
- `06-lut-sheet.png` `07-lut-preview.png` 底部 LUT 面板和 Velvia 预览
- `08-lut-saved.png` `09-exported-snack.png` `10-info-exported.png` 保存、导出、导出路径
- `11-delete-confirm.png` `12-share.png` 删除确认与分享
- `13-motion-viewer.png` `14-motion-playing.png` `15-motion-playing-later.png` 动态照片播放（片段约 3 秒，播完回到静态图）
- `16-motion-lut-saved.png` `17-motion-info.png` `18-motion-lut-preview.png` 动态照片换 LUT 后的画面和文件大小

## 没做完或不确定

- 双指缩放没有在模拟器上操作（`adb` 只有单指）。「放大后滑动不换照片」由 Jest 覆盖。
- 这次演示没有拍出失败或未完成的作品。该状态仍由界面和 Jest 覆盖。
- 没有实体相机。EXIF 和机身快门同步的信息没有在真机上看过。主机测试用 ExifInterface 桩和样例 TIFF 覆盖了字段格式。
