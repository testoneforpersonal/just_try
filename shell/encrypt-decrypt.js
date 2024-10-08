exports.encryptCodes = function (content, passCode) {

    var result = [];
    var passLen = passCode.length;
    if (content) {
        for (var i = 0; i < content.length; i++) {
            result.push(content.charCodeAt(i) + passCode.charCodeAt(i % passLen));
        }
    }

    return JSON.stringify(result);
};

exports.decryptCodes = function (codesArr, passCode) {
    var result = []; var str = '';
    var passLen = passCode.length;
    if (codesArr && codesArr.length) {
        for (var i = 0; i < codesArr.length; i++) {
            var passOffset = i % passLen;
            var calAscii = (codesArr[i] - passCode.charCodeAt(passOffset));
            result.push(calAscii);
        }
        for (var i = 0; i < result.length; i++) {
            var ch = String.fromCharCode(result[i]); str += ch;
        }
    }
    return str;
}

