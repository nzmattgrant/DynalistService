const moment = require("moment");

const DateUtils = {
    getDateFromDynalistNote: (note) => {
        var re = /!\((.*)\)/i;
        const match = note.match(re);
        if(!match){
            return null;
        }
        var currentDateString = match[1];
        return moment(currentDateString);
    }
};

module.exports = DateUtils