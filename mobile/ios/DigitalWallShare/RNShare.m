#import "RNShare.h"
#import <React/RCTUtils.h>

@implementation RNShare

RCT_EXPORT_MODULE();

- (NSArray<NSString *> *)supportedEvents
{
    return @[@"ShareDataReceived"];
}

RCT_EXPORT_METHOD(processShareData:(NSDictionary *)shareData
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    // Process shared content and send to backend
    NSString *apiUrl = @"https://182e96e39f50.ngrok-free.app/api/share";
    NSURL *url = [NSURL URLWithString:apiUrl];

    NSMutableURLRequest *request = [[NSMutableURLRequest alloc] initWithURL:url];
    [request setHTTPMethod:@"POST"];
    [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
    [request setValue:@"application/json" forHTTPHeaderField:@"Accept"];
    [request setValue:@"true" forHTTPHeaderField:@"ngrok-skip-browser-warning"];

    NSError *error;
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:shareData
                                                       options:0
                                                         error:&error];

    if (error) {
        reject(@"JSON_ERROR", @"Failed to serialize share data", error);
        return;
    }

    [request setHTTPBody:jsonData];

    NSURLSessionDataTask *task = [[NSURLSession sharedSession] dataTaskWithRequest:request
                                                                 completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        dispatch_async(dispatch_get_main_queue(), ^{
            if (error) {
                reject(@"NETWORK_ERROR", @"Failed to send share data", error);
            } else {
                resolve(@{@"success": @YES});
            }
        });
    }];

    [task resume];
}

@end
