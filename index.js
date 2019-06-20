const remote = require('electron').remote;
const fs = require('fs-extra');
const readdirp = require('readdirp');
const path = require('path');
const crypto = require('crypto');
const dialog = remote.dialog;

$(function () {
    let setting;

    // 啟動
    init();

    function init() {
        // 取得設定值
        setting = getSetting();

        let elemList = {
            designPath: setting.path.design.pathDir,
            programPath: setting.path.program.pathDir,
            // sitePath: setting.path.site.pathDir,
            modifyPath: setting.path.modify.pathDir
        };

        // 更新View
        updateEleValue(elemList);

        // 初始化tooltip
        $('[data-toggle="tooltip"]').tooltip()

        // #region 路徑設定
        // 取得路徑設定值
        $('.modify-btn').on('click', function () {
            let dataObj = {};
            let pathName = $(this).closest('.row-item').attr("class").split(' ')[0];

            (async () => {
                dataObj[`${pathName}Path`] = setting.path[pathName].pathDir = await getDirPath();
                editFile(setting);
                updateEleValue(dataObj);
            })();
        });
        // #endregion 路徑設定

        // #region 修改監控
        // 建立工作區：複製靜態版至Ｍodify, 建立備份檔
        $('#start-work').on('click', function () {
            let userInput = getSiteInput();

            // 格式檢查
            if (hasInputError(userInput)) {
                return;
            }

            let designPath = path.join(elemList.designPath, userInput.type, `${userInput.siteName}.${userInput.type}`);
            let designCommonPath = path.join(elemList.designPath, userInput.type, '_Common');
            let modifySiteNamePath = path.join(elemList.modifyPath, `${userInput.siteName}.${userInput.type}`);
            let modifySiteNameBackupPath = path.join(elemList.modifyPath, 'Backup');
            let modifySiteNameCommonPath = path.join(elemList.modifyPath, '_Common');

            (async () => {
                const targetSiteName = `${userInput.siteName}.${userInput.type}`;
                // 目標資夾是否存在
                try {
                    await dirExist(designPath);
                } catch (err) {
                    updateEleValue({ workStatus: `<i class="fas fa-exclamation-triangle"></i> ${targetSiteName} 不存在！` });
                    return;
                }
                updateEleValue({ workStatus: `<i class="fas fa-spinner fa-spin"></i> ${targetSiteName} 努力搬運中...` });
                // 清空檔案清單
                updateEleValue({ modifyList: '' });
                // 清空工作區
                await clearDir(elemList.modifyPath);
                // 複製靜態站到工作區
                await copyFile(designPath, modifySiteNamePath);
                // 複製靜態站_Common到工作區
                await copyFile(designCommonPath, modifySiteNameCommonPath);
                // 產生備份檔
                await copyFile(designPath, modifySiteNameBackupPath);
                updateEleValue({ workStatus: `<i class="far fa-check-circle"></i> ${targetSiteName} 完成搬運與備份！` });
            })()
        });

        // 搬移至版空：比對差異檔案，複製到三個地方
        $('#finish-work').on('click', function () {
            let userInput = getSiteInput();

            // 格式檢查
            if (hasInputError(userInput)) {
                return
            }

            let designPath = path.join(elemList.designPath, userInput.type, `${userInput.siteName}.${userInput.type}`);
            // let sitePath = path.join(elemList.sitePath, userInput.type, `${userInput.siteName}.${userInput.type}`);
            let programPath = path.join(elemList.programPath, `Web.${userInput.type}`, `${userInput.siteName}.${userInput.type}`);
            let modifySiteNamePath = path.join(elemList.modifyPath, `${userInput.siteName}.${userInput.type}`);
            let modifySiteNameBackupPath = path.join(elemList.modifyPath, 'Backup');
            let modifySiteNameDistPath = path.join(elemList.modifyPath, 'Dist');
            let modifySiteNameDistPathWithoutScss = path.join(elemList.modifyPath, 'Dist_No_Scss');

            (async () => {
                const targetSiteName = `${userInput.siteName}.${userInput.type}`;

                try {
                    await dirExist(designPath);
                } catch (err) {
                    updateEleValue({ workStatus: `<i class="fas fa-exclamation-triangle"></i> ${targetSiteName} 不存在！` });
                    return;
                }

                updateEleValue({ workStatus: `<i class="fas fa-spinner fa-spin"></i> ${targetSiteName} 複製檔案至版控中...` });
                // 取得所有檔案清單
                let allModifyFileList = await listAllFilePath(modifySiteNamePath);
                // 取得異動檔案清單
                let resultFileList = listModifyFilePath(allModifyFileList, modifySiteNamePath, modifySiteNameBackupPath);
                if (resultFileList.length === 0) {
                    updateEleValue({ workStatus: `<i class="fas fa-exclamation-triangle"></i> ${targetSiteName} 沒有異動檔案！` });
                    return;
                }
                // 取得不含SCSS異動清單
                let resultFileListWithoutScss = await filterScss(resultFileList);

                // 產出異動檔案包
                await exportDist(resultFileList, modifySiteNamePath, modifySiteNameDistPath);
                // Dist to design  (scss/css/html/img)
                await copyFile(modifySiteNameDistPath, designPath);
                // Dist to program (only css and img)
                // 沒有任何樣式項目就不做
                if (resultFileListWithoutScss.length !== 0) {
                    await exportDist(resultFileListWithoutScss, modifySiteNamePath, modifySiteNameDistPathWithoutScss);
                    await copyFile(path.join(modifySiteNameDistPathWithoutScss, 'Content'), path.join(programPath, 'Content'));
                }

                // 顯示檔案清單
                await showModifyList(resultFileList, 'modifyList');
                updateEleValue({ workStatus: `<i class="far fa-check-circle"></i> ${targetSiteName} 檔案已成功搬至版控！` });
            })();
        });
        // #endregion 修改監控

        // #region 圖片搬移

        // 準備空資料夾
        $('#start-img-move').on('click', function () {

            let casinoType = getRadioInput('casino-types');

            let programRootPath = path.join(elemList.programPath, 'Web.Portal');
            let designRootPath = path.join(elemList.designPath, 'Portal');

            let modifyRootPath = elemList.modifyPath;

            (async () => {
                updateEleValue({ imgMoveStatus: `<i class="fa-spinner fa-spin"></i> 準備環境中...` });
                // 取得所有站台清單
                let programSiteList = await listAllFilePath(programRootPath, true);
                let designSiteList = await listAllFilePath(designRootPath, true);

                // 清空工作區
                await clearDir(elemList.modifyPath);
                // 建立站台空資料夾
                await createDir(modifyRootPath, programSiteList);
                updateEleValue({ imgMoveStatus: `<i class="fas fa-check-circle"></i> "${casinoType}"資料夾已完成!` });
            })();
        });

        // 批次搬移圖片
        $('#finish-img-move').on('click', function () {

            let casinoType = getRadioInput('casino-types');
            let targetCasinoPath = path.join('Content', 'Views', 'Lobby', casinoType);
            let programRootPath = path.join(elemList.programPath, 'Web.Portal');
            let designRootPath = path.join(elemList.designPath, 'Portal');
            let modifyRootPath = elemList.modifyPath;

            (async () => {
                updateEleValue({ imgMoveStatus: `<i class="fa-spinner fa-spin"></i> 搬移圖片中...` });
                // 取得所有站台清單
                let allSiteList = await listAllFilePath(modifyRootPath, true);

                // 複製圖片至目標
                allSiteList.forEach(async l => {
                    let srcPath = path.join(modifyRootPath, l);
                    let destProgramPath = path.join(programRootPath, l, targetCasinoPath);
                    let destDesignPath = path.join(designRootPath, l, targetCasinoPath);

                    await copyFile(srcPath, destProgramPath);
                    await copyFile(srcPath, destDesignPath);
                });

                updateEleValue({ imgMoveStatus: `<i class="fas fa-check-circle"></i> "${casinoType}"圖片已搬移至靜態與動態版控` });

            })();
        });
        // #endregion 圖片搬移

        // #region 樣式同步
        // CSS搬移
        $('#start-css-move').on('click', function () {
            // let cssRange = getRadioInput('css-range');
            let cssRange = 'Lobby, Shared';
            let programRootPath = path.join(elemList.programPath, 'Web.Portal');
            let designRootPath = path.join(elemList.designPath, 'Portal');

            (async () => {
                updateEleValue({ cssMoveStatus: `<i class="fas fa-spinner fa-spin"></i> 搬移CSS中...` });
                // 取得所有站台CSS清單
                let allSiteCssList = await listAllFilePath(designRootPath, false, true);

                let newCssList = allSiteCssList.filter(l => {
                    return l.indexOf('Lobby') !== -1 || l.indexOf('Shared') !== -1 && l.indexOf('_Common') === -1;
                });

                allSiteCssList = newCssList;

                // 複製CSS至目標
                allSiteCssList.forEach(async l => {
                    let destProgramPath = path.join(programRootPath, l);
                    let destDesignPath = path.join(designRootPath, l);

                    await copyFile(destDesignPath, destProgramPath);
                });

                // 顯示檔案清單
                // await showModifyList(allSiteCssList, 'modifyCssList');
                updateEleValue({ cssMoveStatus: `<i class="fas fa-check-circle"></i> "${cssRange}"靜態版控CSS已搬至動態版控!` });
            })();
        });
        // #endregion 樣式同步
    }
});

// Functions

// 比較兩個陣列是否相等
// 註 : 只檢查 string[]
function arraysEqual(a1, a2) {
    return JSON.stringify(a1) == JSON.stringify(a2);
}

// 取得路徑設定
function getSetting() {
    return JSON.parse(fs.readFileSync('./setting.json').toString());
}

// 取得路徑設定
function getSiteInput() {
    return {
        siteName: $('#site-name').val(),
        type: getRadioInput('theme-types')
    }
}

// 取得radio box value
function getRadioInput(name) {
    return $(`input[name="${name}"]:checked`).val()
}

// Check Input format
function hasInputError(value) {
    let reg = /[A-Z]{2}0[0-9]{2}-[0-9]{2}/g;

    // Empty?
    if (!value.siteName) {
        updateEleValue({ workStatus: '<i class="fas fa-exclamation-triangle"></i> 請輸入站名~' });
        return true;
    }

    // match format check?
    if (value.siteName.match(reg) == null) {
        updateEleValue({ workStatus: '<i class="fas fa-exclamation-triangle"></i> 格式有誤, 請重新輸入~' });
        return true;
    }
}

// Filter Scss list 
function filterScss(list) {
    return new Promise((resolve, reject) => {
        let newList = [];

        newList = list.filter(v => {
            return v.indexOf('.scss') === -1 && v.indexOf('.map') === -1;
        });

        resolve(newList);
    })
}

// Update Element value
function updateEleValue(obj) {
    for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
            $(`[data-bind=${key}]`).html(obj[key]);
        }
    }
}

// 顯示修改檔案清單
function showModifyList(list, showPlace) {
    let listContent = [],
        innerElement = '',
        listObj = {};

    list.forEach(element => {
        listContent.push(`<li>${element}</li>`);
    });

    innerElement = listContent.join('');
    listObj[showPlace] = `<ul>${innerElement}</ul>`;
    updateEleValue(listObj);
}

// 檢查 Dir 是否存在
function dirExist(dir) {
    return new Promise((resolve, reject) => {
        fs.stat(dir, err => {
            if (err) {
                reject();
            }
            resolve();
        });
    })
}

// Get Directory path
function getDirPath() {
    return new Promise((resolve, reject) => {
        dialog.showOpenDialog({ properties: ['openDirectory'] }, (dirPath) => {
            if (dirPath === undefined) {
                console.log("No file selected");
            } else {
                resolve(dirPath[0]);
            }
        });
    })
}

// read file content
function readFile(filepath) {
    return new Promise((resolve, reject) => {
        fs.readFile(filepath, 'utf-8', function (err, data) {
            if (err) {
                alert("An error ocurred reading the file :" + err.message);
                return;
            }
            resolve(data);
        });
    })
}

// 刪除 Dir
function clearDir(dir) {
    return new Promise((resolve, reject) => {
        fs.emptyDir(dir, err => {
            if (err) {
                reject(console.log(err));
            }
            resolve();
        });
    })
}

// copy files
function copyFile(source, target) {
    return new Promise((resolve, reject) => {
        fs.copy(source, target, function (err) {
            if (err) {
                alert(err.message);
                return;
            }
            resolve();
        });
    })
}

// Edit files
function editFile(data) {
    return new Promise((resolve, reject) => {
        let content = JSON.stringify(data);
        fs.writeFile('./setting.json', content, 'utf8', (err) => {
            if (err) {
                alert(err.message);
            }
            resolve();
        });
    })
}

// Create dir
function createDir(modifyPath, list) {
    return new Promise((resolve, reject) => {
        list.forEach(l => {
            let dirPath = path.join(modifyPath, l)
            fs.mkdirSync(dirPath);
        });
        resolve();
    })
}

// 取得hash值
function getFileHash(filePath) {
    let buffer = fs.readFileSync(filePath);
    return crypto.createHash('sha1').update(buffer).digest('hex');
}

// 列出所有檔案
function listAllFilePath(rootPath, isSiteNameDirMode, isCss) {
    return new Promise((resolve, reject) => {

        // 忽略清單
        let ignoreFileList = ['!gulpfile.js',
            '!package.json',
            '!*.asax',
            '!*.config',
            '!App_Data',
            '!CdnRedirect',
            '!Cdn2Redirect',
            '!node_modules',
            '!fonts'];

        if (isCss === true) {
            ignoreFileList = ['*.css']
        }

        // 參數設定
        let options = {
            root: rootPath,
            entryType: isSiteNameDirMode ? 'directories' : 'files',
            fileFilter: ignoreFileList,
            depth: isSiteNameDirMode ? 0 : null
        };

        // 所有檔案路徑
        let rawFilePaths = [];
        readdirp(options,
            // This callback is executed everytime a file or directory is found inside the providen path
            fileInfo => {
                // parentDir : directory in which entry was found (relative to given root)
                // fullParentDir : full path to parent directory
                // name : name of the file/directory
                // path : path to the file/directory (relative to given root)
                // fullPath : full path to the file/directory found
                // stat : built in stat object
                if (fileInfo.path !== '_Common') {
                    rawFilePaths.push(
                        fileInfo.path
                    );
                }
            },

            // This callback is executed once 
            (err) => {

                if (err) {
                    reject(console.log(err));
                } else {
                    resolve(rawFilePaths);
                }
            }
        );
    })
}

// 比對 Modify 與 backup 檔案
function listModifyFilePath(filePathArray, modifyPath, backupPath) {
    // 篩選後檔案
    let resultFileList = [];

    // 篩選出有被改過的檔案
    resultFileList = filePathArray.filter(value => {
        let sourceFilePath = path.join(modifyPath, value);
        let backupFilePath = path.join(backupPath, value);

        // 若備份檔不存在, 表示是新增檔案
        try {
            fs.statSync(backupFilePath);
            return getFileHash(sourceFilePath) !== getFileHash(backupFilePath);
        }
        catch (err) {
            return true;
        }
    });

    return resultFileList;
}

// 複製檔案到Dist
function exportDist(pathArray, sourcePath, distPath) {
    return new Promise((resolve, reject) => {
        for (let i = 0; i < pathArray.length; i++) {
            let resultFilePath = path.join(sourcePath, pathArray[i]);
            let distFilePath = path.join(distPath, pathArray[i]);

            fs.copySync(resultFilePath, distFilePath);
        }
        resolve();
    })
}