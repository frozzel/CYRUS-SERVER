
const mongoose = require('mongoose');
const { Schema } = mongoose;

const messageSchema = new Schema({
	role: { type: String, enum: ['user', 'ai'], required: true },
	text: { type: String, required: true },
	timestamp: { type: Date, default: Date.now },
	meta: { type: Schema.Types.Mixed }
}, { _id: false });

const ConversationSchema = new Schema({
	conversationId: { type: String, required: true, unique: true, index: true },
	messages: { type: [messageSchema], default: [] },
	contact: {
		name: { type: String },
		email: { type: String },
		phone: { type: String }
	},
	hubspotLeadId: { type: String, default: null },
	converted: { type: Boolean, default: false },
	expiresAt: { type: Date, default: () => new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) }
}, { timestamps: true });

ConversationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

ConversationSchema.methods.markConverted = function(hubspotId) {
	this.converted = true;
	if (hubspotId) this.hubspotLeadId = hubspotId;
	this.expiresAt = undefined;
	return this.save();
};

ConversationSchema.methods.addMessage = function(role, text, meta) {
	this.messages.push({ role, text, meta, timestamp: new Date() });
	return this.save();
};

module.exports = mongoose.models.Conversation || mongoose.model('Conversation', ConversationSchema);

