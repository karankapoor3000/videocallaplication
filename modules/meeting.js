const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
  title: String,
  date: Date,
  link: String,
  createdBy: String
});

module.exports = mongoose.model('Meeting', meetingSchema);
