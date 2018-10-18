/**
 * 整体概述
 *
 *  最自然的想法是把相交事件触发写到每个图片上，然后长按图片的时候，可以拖动当前图片，当前图片会和其他图片有个相交状态。
 *  这样做的话，有4个比较难处理的点：
 *    1、当前照片的 z-index 的设置，要让他高度为最高。 z-index 和 transform 有个失效的问题。（不是说不能处理哈，只是说有这个问题）
 *    2、移动动画中的图片和当前图片的相交状态的触发（要写一些条件判断，而且很难做成连续触发）
 *    3、图片两两之间需要有个相交监听，另外每张图都要和删除区域有个相交监听。
 *    4、空白占位的处理及各个位置的计算。
 *  基于以上考虑，改成了由1个公共的移动块，每个位置有个座位，座位正中间放个小块，来触发相交事件。给这个移动块设上当前移动的图片的src。现结构如下：
 *  一共分为4个部分，座位层、图片层、移动块、删除区域。
 *  座位层：相当于是底座，用flex布局，然后用createSelectorQuery取得每个座位的坐标，再把图片层的每个图片设置到对应位置。因为有个添加按钮，所以座位会比图片的列表多1
 *  图片层：就是可见的图片区域
 *  移动块：用来触发各种区域相交事件的块。
 *  删除区域：底部的提示删除部分，当移动块有移动的时候才显示，拖上去后会把 isDelete = true，touchend的时候进行删除。
 *
 */
// 记录每个座位的位置，方便悬浮块定位，以及每次动画，各块的位移，存储单位为px，[left,top]
let seatsArray = []
// 记录当前每个图当前位于哪个座位。比如最开始添加了3张图，那么positionArray里就应该是[0,1,2]。如果位置2的移动到0的位置，那么数组就变成了[2,0,1]
let positionArray = []
// observer列表，方便删除的时候销毁
let observerArray = []
// 动画实例列表
let animationArray = []
// px和rpx的转换率 1px * rate = 1rpx
let rate = 1
// 移动块的动画实例
let animationMove = wx.createAnimation({})
// 新增按钮的动画实例
let animationAdd = wx.createAnimation({})
// 删除区域的动画实例
let animationDel = wx.createAnimation({})

Page({
    data: {

        // 图片层部分的动画列表，新增按钮除外
        animationArray: [],

        // 移动块的动画
        animationMove: {},

        // 新增按钮的动画
        animationAdd: {},

        // 删除区域的动画
        animationDel: {},

        // 图片的列表，在获取结果前，顺序固定，不会跟着界面上的可视位置改变
        imageArray: [],

        // 座位个数，因为要计算新增按钮位置，所以座位个数是图片数量+1
        // TODO 这里有个问题没处理，就是选了9张图后，就有了10个位置。。界面上会多出一行的位置。
        seatNumber: 0,

        // 当前选中块在 imageArray中的位置
        selected: -1,
    },
    onLoad: function() {
        let ret = wx.getSystemInfoSync()
        rate = 750 / ret.windowWidth // 750rpx除以当前屏幕宽度的px值，得到转换比

        // 是否显示删除区域
        this.showDel = false
    },
    onReady: function() {
        // 监听移动块和删除区域的相交
        let _observer = wx.createIntersectionObserver()
        _observer
            .relativeTo('#movingCover')
            .observe('#del', (res) => {
                if (res.intersectionRatio == 0) {
                    this.delete = false
                } else {
                    this.delete = true
                }
            })
    },
    /**
     * 触摸开始，要记录开始点的位置，记录当前按中的图的序号
     */
    start(e) {
        this.delete = false
        this.data.selected = e.currentTarget.dataset.index
        this.startX = e.changedTouches[0].pageX
        this.startY = e.changedTouches[0].pageY

        // 先把移动块位置移动到当前选中的图的位置
        // 当前选中图的座位坐标
        let seat = seatsArray[positionArray[this.data.selected]]

        this.selectedPos = seat
        animationMove.translate(seat[0], seat[1]).step({
            duration: 10,
            timingFunction: 'step-end'
        })
        this.setData({
            animationMove: animationMove.export(),
        })
        this.focusTimer = setTimeout(() => {
            // 把移动块进行放大，透明
            animationMove.scale(1.1).opacity(0.9).step({
                duration: 200
            })
            // 同时隐藏掉本来这个位置的图
            animationArray[this.data.selected].opacity(0).step({
                duration: 10,
                timingFunction: 'step-end'
            })
            this.data.animationArray[this.data.selected] = animationArray[this.data.selected].export()
            this.setData({
                selectedImg: this.data.imageArray[this.data.selected],
                selected: this.data.selected,
                animationMove: animationMove.export(),
                animationArray: this.data.animationArray
            }, () => {
                this.startMove = true
            })
        }, 200)
    },

    /**
     * 触摸移动
     */
    move(e) {
        // 表明已经move了，就不再end的时候不再进行预览
        this.trigger = true

        if (this.focusTimer) {
            clearTimeout(this.focusTimer)
            this.focusTimer = 0
        }
        if (!this.startMove) {
            return
        }

        // 移动的时候，如果没显示底部删除区域，则显示底部删除区域
        if (!this.showDel) {
            animationDel.translateY(-50).step()
            this.setData({
                animationDel: animationDel.export()
            })
            this.showDel = true
        }

        let startX = e.changedTouches[0].pageX
        let startY = e.changedTouches[0].pageY
        let positionX = this.selectedPos[0] + startX - this.startX
        let positionY = this.selectedPos[1] + startY - this.startY

        // 设置移动块当前位置
        animationMove.translate(positionX, positionY).step({
            timingFunction: 'step-start'
        })
        this.setData({
            animationMove: animationMove.export(),
        })
    },
    /**
     * 触摸结束，如果是短按，切没移动过，就预览图片。
     */
    end(e) {
        if (this.focusTimer) {
            clearTimeout(this.focusTimer)
            this.focusTimer = 0
        }
        if (!this.startMove) {
            if (!this.trigger) {
                wx.previewImage({
                    urls: [this.data.imageArray[this.data.selected]]
                })
            }
            return
        }
        this.startMove = false
        this.trigger = false
        if (this.showDel) {
            animationDel.translateY(0).step()
            this.setData({
                animationDel: animationDel.export()
            })
            this.showDel = false
            if (this.delete) {
                this.deleteSelected()
                return
            }
        }

        // 将移动块放回之前选中的图现在所在的位置
        let seat = seatsArray[positionArray[this.data.selected]]
        animationMove.translate(seat[0], seat[1]).scale(1).opacity(1).step({
            duration: 100
        })
        // 在移动块回来后，显示在touchstart时候隐藏掉的，当前选中的这个图，设200的delay是确保之前100ms的动画执行完
        animationArray[this.data.selected].opacity(1).step({
            delay: 200,
            duration: 10,
        })
        this.data.animationArray[this.data.selected] = animationArray[this.data.selected].export()
        this.setData({
            animationMove: animationMove.export(),
            animationArray: this.data.animationArray
        }, () => {
            // 确保touchstart时候隐藏掉的，当前选中的这个图已经显示，延迟隐藏移动块
            setTimeout(() => {
                this.setData({
                    selectedImg: "",
                    selected: -1,
                })
            }, 300)

        })
    },

    /**
     * 相交事件触发时候，整体的移动
     * isFront true为往前移动，false为往后移动
     * startPos 需要移动的起始位置
     * endPos 需要移动的重点位置
     */
    _moveImages(isFront, startPos, endPos) {
        let length = this.data.imageArray.length
        for (let i = 0; i < length; i++) {
            let targetPos
            let position = positionArray[i]
            if (isFront) {
                // 往前移动的时候，选中图当前位置到选中图本来位置之间的图，均向后移动一格
                if (position >= startPos && position < endPos) {
                    targetPos = position + 1
                    positionArray[i] = targetPos
                    animationArray[i].translate(seatsArray[targetPos][0], seatsArray[targetPos][1]).step()
                    this.data.animationArray[i] = animationArray[i].export()
                }
            } else {
                // 往后移动的时候，选中图当前位置到选中图本来位置之间的图，均向前移动一格
                if (position > startPos && position <= endPos) {
                    targetPos = position - 1
                    positionArray[i] = targetPos
                    animationArray[i].translate(seatsArray[targetPos][0], seatsArray[targetPos][1]).step()
                    this.data.animationArray[i] = animationArray[i].export()
                }
            }
        }

        // 移动当前选中图的位置，往前的时候，移动到起点位置；往后的时候，移动到终点位置
        if (isFront) {
            positionArray[this.data.selected] = startPos
            animationArray[this.data.selected].translate(seatsArray[startPos][0], seatsArray[startPos][1]).step()
        } else {
            positionArray[this.data.selected] = endPos
            animationArray[this.data.selected].translate(seatsArray[endPos][0], seatsArray[endPos][1]).step()
        }
        this.data.animationArray[this.data.selected] = animationArray[this.data.selected].export()
        this.setData({
            animationArray: this.data.animationArray
        })
    },

    /**
     * 添加图片
     */
    addImage() {
        wx.chooseImage({
            count: 9 - this.data.imageArray.length, //最多9张图
            success: (res) => {
                let length = this.data.imageArray.length
                // TODO 这里本来不必和删除的时候一样整理整个图片列表的，但是有个顺序问题，一直没处理好。。
                let newImageArray = []
                for (let i = 0; i < length; i++) {
                    let position = positionArray[i]
                    newImageArray[position] = this.data.imageArray[i]
                }
                newImageArray = newImageArray.concat(res.tempFilePaths)
                observerArray.forEach(item => {
                    item.disconnect()
                })

                this.setData({
                    imageArray: newImageArray,
                    seatNumber: newImageArray.length + 1
                }, () => {
                    this._addObservers()
                    this._getSeats()
                })
            },
        })
    },
    /**
     * 删除当前选中的图
     */
    deleteSelected() {
        for (let i = 0; i < animationArray.length; i++) {
            animationArray[i].opacity(1).step({
                duration: 10,
                timingFunction: 'step-end'
            })
            this.data.animationArray[i] = animationArray[i].export()
        }

        this.setData({
            selectedImg: "",
            animationArray: this.data.animationArray
        }, () => {
            let selectedPos = positionArray[this.data.selected]
            let length = this.data.imageArray.length
            let newImageArray = []
            for (let i = 0; i < length; i++) {
                let position = positionArray[i]
                if (position < selectedPos) {
                    newImageArray[position] = this.data.imageArray[i]
                } else if (position > selectedPos) {
                    newImageArray[position - 1] = this.data.imageArray[i]
                }
            }
            observerArray.forEach(item => {
                item.disconnect()
            })
            this.setData({
                imageArray: newImageArray,
                seatNumber: newImageArray.length + 1
            }, () => {

                this._addObservers()
                this._getSeats()

                // 复位移动块状态
                animationMove.scale(1).opacity(1).step({
                    duration: 10,
                    timingFunction: 'step-end'
                })
                this.setData({
                    animationMove: animationMove.export()
                }, () => {
                    this.setData({
                        selected: -1,
                    })
                })
            })
        })
    },

    /**
     * 获取最后的图片列表
     */
    getResult() {
        let length = this.data.imageArray.length
        let newImageArray = []
        for (let i = 0; i < length; i++) {
            let position = positionArray[i]
            newImageArray[position] = this.data.imageArray[i]
        }
        console.log(newImageArray)
    },

    /**
     * 添加相交监听
     */
    _addObservers: function() {
        let length = this.data.imageArray.length
        for (let i = 0; i < length; i++) {
            let _observer = wx.createIntersectionObserver()
            _observer
                .relativeTo('#movingCover')
                .observe('#inner' + i, (res) => {
                    if (res.intersectionRatio > 0 && res.intersectionRatio < 1) {
                        let currentPos = positionArray[this.data.selected]
                        if (i < currentPos) {
                            // 往前挪，i位置到currentPos之间的所有块都向后挪1格，current == i
                            this._moveImages(true, i, currentPos)
                        } else if (i > currentPos) {
                            // 往后挪，i位置到currentPos之间的所有块都向前挪1格，current == i
                            this._moveImages(false, currentPos, i)
                        }
                    }
                })
            observerArray[i] = _observer
            positionArray[i] = i
        }
    },

    /**
     * 获取所有座位位置
     */
    _getSeats: function() {
        wx.createSelectorQuery().selectAll('.seats').boundingClientRect(res => {
            let drift = [res[0].left, res[0].top]
            console.log(res)
            seatsArray = []
            res.forEach(item => {
                let seat = [item.left - drift[0], item.top - drift[1]]
                seatsArray.push(seat)
            })
            let length = res.length - 1
            animationArray = []
            this.data.animationArray = []
            for (let i = 0; i < length; i++) {
                let seat = [res[i].left - drift[0], res[i].top - drift[1]]
                seatsArray[i] = seat
                let animation = wx.createAnimation({
                    timingFunction: 'easy-out'
                })
                animationArray[i] = animation
                animation.translate(seat[0], seat[1]).step({
                    duration: 100,
                    timingFunction: 'step-end'
                })
                this.data.animationArray[i] = animation.export()
            }
            animationAdd.translate(res[length].left - drift[0], res[length].top - drift[1]).step({
                duration: 100,
                timingFunction: 'step-end'
            })
            this.setData({
                animationArray: this.data.animationArray,
                animationAdd: animationAdd.export()
            })
        }).exec()
    }
})