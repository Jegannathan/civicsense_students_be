'use strict';
import mongoose from 'mongoose';
import uuid from 'uuid/v4';
import AdminSchema from '../schemas/admin';
import LocationSchema from '../schemas/location';
import UserSchema from '../schemas/user';

class AdminController {
    public setPostLoginAdminRoutes = async (fastify) => {
        fastify.get('/campaigns/live', {}, async (request, reply) => {
            if (request.validationError) {
                return reply.code(400).send(request.validationError);
            }
            try {
                return reply.status(200).send({
                    campaigns: await fastify.getLiveCampaigns()
                });
            } catch (error) {
                reply.status(500);
                return reply.send({
                    error ,
                    message: error.message ? error.message : 'error happened'

                });

            }
        });
        fastify.post('/campaigns', AdminSchema.addCampaigns, async (request, reply) => {
            if (request.validationError) {
                return reply.code(400).send(request.validationError);
            }
            try {
                request.body.createdBy = request.session.user.userId;
                await fastify.insertCampaign(request.body);
                const userData = await fastify.findLocationBasedUserData(request.body.locationIds);
                userData.forEach(async (data) => {
                    const payload = {
                        message: `${request.body.description} and earn ${request.body.rewards} gems `,
                        title: request.body.campaignName,
                        messageId: uuid()
                    };
                    if (data.mobileDeviceEndpoint && data.platform) {
                        await fastify.awsPlugin.snsSendNotification(data, payload);
                    }
                });
                return reply.status(200).send();
            } catch (error) {
                reply.status(500);
                return reply.send({
                    error ,
                    message: error.message ? error.message : 'error happened'

                });

            }
        });
        fastify.get('/campaigns/:campaignId', AdminSchema.getCampaignDetails, async (request, reply) => {
            if (request.validationError) {
                return reply.code(400).send(request.validationError);
            }
            try {
                return reply.status(200).send(await fastify.getCampaignDetails(request.params.campaignId,  request.query ? request.query.lastRecordCreatedAt : undefined));
            } catch (error) {
                reply.status(500);
                return reply.send({
                    error ,
                    message: error.message ? error.message : 'error happened'
                });

            }
        });

        fastify.get('/location', {}, async (request, reply) => {
            try {
                return reply.status(200).send(await fastify.getLocation());
            } catch (error) {
                reply.status(500);
                return reply.send({
                    error ,
                    message: error.message ? error.message : 'error happened'
                });

            }
        });

        fastify.put('/submission/:submissionId', AdminSchema.validateSubmission, async (request, reply) => {
            if (request.validationError) {
                return reply.code(400).send(request.validationError);
            }
            try {
                const campaignResponse = await fastify.getCampaign(request.body.campaignId);
                request.body.rewards = request.body.status === 'ACCEPTED' ? campaignResponse.rewards : 0;
                const data = await fastify.updateTask(request.params.submissionId, request.body);
                if (request.body.rewards) {
                    await fastify.updateRewards(data.userId, request.body.rewards);
                }
                await fastify.updateEntries(request.body.campaignId, false);
                return reply.status(200).send();
            } catch (error) {
                reply.status(500);
                return reply.send({
                    error ,
                    message: error.message ? error.message : 'error happened'
                });

            }
        });
        fastify.post('/location', LocationSchema.add, async (request, reply) => {
            if (request.validationError) {
                return reply.code(400).send(request.validationError);
            }
            try {
                request.body.location.type = 'MultiPolygon';
                request.body.createdBy = request.session.user.userId;

                return reply.status(200).send({
                    locations: await fastify.insertLocation(request.body)
                });
            } catch (error) {
                reply.status(500);
                return reply.send({
                    error ,
                    message: error.message ? error.message : 'error happened'

                });

            }
        });
        fastify.post('/rewards', AdminSchema.addRewards, async (request, reply) => {
            const file = request.body.file[0];
            if (request.validationError && !file.data) {
                return reply.code(400).send(request.validationError);
            }
            try {
                const fileKey = `${mongoose.Types.ObjectId()}.${file.filename.split('.').pop()}`;
                await fastify.awsPlugin.uploadFile(file, fileKey, true);
                request.body.photoId = fileKey;
                await fastify.addRewards(request.session.user.userId, request.body);
                return reply.status(200).send({
                    success: true
                });

            } catch (error) {
                reply.status(500);
                return reply.send({
                    error ,
                    message: error.message ? error.message : 'error happened'

                });
            }
        });
        fastify.put('/rewards/:rewardId', AdminSchema.editRewards, async (request, reply) => {
            const file = request.body.file[0];
            if (request.validationError) {
                return reply.code(400).send(request.validationError);
            }
            try {
                if (file) {
                    const fileKey = `${mongoose.Types.ObjectId()}.${file.filename.split('.').pop()}`;
                    await fastify.awsPlugin.uploadFile(file, fileKey, true);
                    request.body.photoId = fileKey;
                }
                await fastify.editRewards(request.params.rewardId, request.session.user.userId, request.body);
                return reply.status(200).send({
                    success: true
                });

            } catch (error) {
                reply.status(500);
                return reply.send({
                    error ,
                    message: error.message ? error.message : 'error happened'

                });
            }
        });

    };
    public setPreLoginAdminRoutes = async (fastify) => {
        fastify.post('/admin/add', AdminSchema.add, async (request, reply) => {
            if (request.validationError) {
                return reply.code(400).send(request.validationError);
            }
            try {
                await fastify.insertUser(request.body, true);
                return reply.status(200).send();
            } catch (error) {
                reply.status(500);
                return reply.send({
                    error ,
                    message: error.message ? error.message : 'error happened'

                });

            }
        });
        fastify.post('/admin/login', UserSchema.login, async (request, reply) => {
            if (request.validationError) {
                return reply.code(400).send(request.validationError);
            }
            try {
                if (await fastify.login(request.body, true)) {
                    request.session.user = {
                        userId: request.body.userId,
                        isAdmin: true
                    };
                    // save sessionId in redis
                    return reply.send({
                        success: true
                    });
                }
                return reply.send({
                    success: false
                });
            } catch (error) {
                reply.status(500);
                return reply.send({
                    error ,
                    message: error.message ? error.message : 'error happened'

                });

            }
        });
        };
}

export const PostLoginAdminController = new AdminController().setPostLoginAdminRoutes;
export const PreLoginAdminController = new AdminController().setPreLoginAdminRoutes;
