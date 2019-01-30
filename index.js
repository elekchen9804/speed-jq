const remote = require('electron').remote;
const fs = remote.require('fs-extra');
const path = remote.require('path');
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
            sitePath: setting.path.site.pathDir,
            modifyPath: setting.path.modify.pathDir
        };

        // 更新View
        updateEleValue(elemList);

        // 取得路徑設定值
        $('.modify-btn').on('click', function () {
            let dataObj = {};
            let pathName = $(this).closest('div.row').attr("class").split(' ')[0];

            (async () => {
                dataObj[`${pathName}Path`] = setting.path[pathName].pathDir = await getDirPath();
                updateEleValue(dataObj);
            })();
        });

        // 儲存設定
        $('.setting-save').on('click', async () => {
            await editFile(setting);
        });
    }
});

// Functions

// 取得設定
function getSetting() {
    return JSON.parse(fs.readFileSync('./setting.json').toString());
}

// Update Element value
function updateEleValue(obj) {
    for (let key in obj) {
        console.log('key', key);
        console.log('obj', obj[key]);
        if (obj.hasOwnProperty(key)) {
            $(`[data-bind=${key}]`).html(obj[key]);
        }
    }
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

// 修改Webconfig站名字串
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
